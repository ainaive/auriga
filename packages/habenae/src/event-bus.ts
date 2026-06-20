import type { Pool, PoolClient } from "pg";
import type { JobEventEnvelope, JobLiveEvent } from "@auriga/core";

/** Cancels a {@link EventBus.subscribe}. */
export type Unsubscribe = () => void;

/** What a publisher supplies; the bus assigns the monotonic `seq` and `ts`. */
export type PublishInput = Omit<JobEventEnvelope, "seq" | "ts">;

/**
 * Per-job publish/subscribe for live run events — the seam that carries the
 * agent's step-by-step progress from the Worker to a watching browser.
 *
 * Two drivers behind one interface (the project's seam pattern): an in-memory
 * bus for dev/tests/in-process runs, and (Phase 5) a Postgres LISTEN/NOTIFY bus
 * for the production cross-process (graphile-worker) path. `seq` is monotonic per
 * `job_id`, so a reconnecting client can replay-then-tail without gaps or dupes.
 */
export interface EventBus {
  /** Assign a per-job `seq` + `ts`, persist for backfill, and fan out to live subscribers. */
  publish(input: PublishInput): Promise<JobEventEnvelope>;
  /** Live tail. Awaits readiness (e.g. Postgres LISTEN attached) then returns an unsubscribe fn,
   *  so a caller can subscribe-before-backfill without a gap. */
  subscribe(jobId: string, onEvent: (env: JobEventEnvelope) => void): Promise<Unsubscribe>;
  /** Durable backfill: events for `jobId` with `seq > afterSeq`, in order. */
  replay(jobId: string, afterSeq: number): Promise<JobEventEnvelope[]>;
}

/**
 * In-memory {@link EventBus} for dev, tests, and the in-process runner. The
 * publisher (Worker) and subscriber (SSE endpoint) share one instance in a single
 * process, so the whole live-run path is exercised with zero infrastructure.
 *
 * `publish` assigns `seq` and appends synchronously (no `await` before the push),
 * so concurrent fire-and-forget publishes keep their call order.
 */
export class InMemoryEventBus implements EventBus {
  private readonly logs = new Map<string, JobEventEnvelope[]>();
  private readonly listeners = new Map<string, Set<(env: JobEventEnvelope) => void>>();

  async publish(input: PublishInput): Promise<JobEventEnvelope> {
    const log = this.logs.get(input.job_id) ?? [];
    const env: JobEventEnvelope = {
      ...input,
      seq: log.length + 1,
      ts: new Date().toISOString(),
    };
    log.push(env);
    this.logs.set(input.job_id, log);

    const subs = this.listeners.get(input.job_id);
    if (subs) {
      for (const fn of subs) {
        try {
          fn(structuredClone(env));
        } catch (err) {
          // A misbehaving subscriber must not break the publish or other subscribers.
          console.warn(
            `[auriga] event subscriber threw: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }
    return structuredClone(env);
  }

  async subscribe(jobId: string, onEvent: (env: JobEventEnvelope) => void): Promise<Unsubscribe> {
    let set = this.listeners.get(jobId);
    if (!set) {
      set = new Set();
      this.listeners.set(jobId, set);
    }
    set.add(onEvent);
    return () => {
      const current = this.listeners.get(jobId);
      if (!current) return;
      current.delete(onEvent);
      if (current.size === 0) this.listeners.delete(jobId);
    };
  }

  async replay(jobId: string, afterSeq: number): Promise<JobEventEnvelope[]> {
    const log = this.logs.get(jobId) ?? [];
    return log.filter((e) => e.seq > afterSeq).map((e) => structuredClone(e));
  }
}

/** Convenience: build a fully-typed envelope input for a job. */
export function liveEvent(job_id: string, factio: string, data: JobLiveEvent): PublishInput {
  return { job_id, factio, data };
}

/** Postgres NOTIFY channel for cross-process live events. */
const CHANNEL = "auriga_job_events";

/** Schema for the durable backfill log (also mirrored in migrations/0005_job_events.sql). */
export const JOB_EVENTS_SCHEMA_SQL = `
create table if not exists job_events (
  seq    bigserial primary key,
  job_id text not null,
  ts     timestamptz not null default now(),
  factio text not null,
  data   jsonb not null
);
create index if not exists job_events_job_seq_idx on job_events (job_id, seq);
`;

interface JobEventRow {
  seq: string;
  job_id: string;
  ts: Date;
  factio: string;
  data: JobLiveEvent;
}

function rowToEnvelope(row: JobEventRow): JobEventEnvelope {
  return {
    seq: Number(row.seq),
    job_id: row.job_id,
    ts: row.ts.toISOString(),
    factio: row.factio,
    data: row.data,
  };
}

/**
 * Postgres-backed {@link EventBus} for the production cross-process path: a
 * durable `job_events` table for backfill plus `LISTEN/NOTIFY` for fan-out across
 * processes (the graphile worker publishes; the API's SSE endpoint subscribes).
 * `seq` is a `bigserial` — globally monotonic, so fire-and-forget concurrent
 * publishes never race on the cursor. The NOTIFY payload carries only
 * `{ job_id, seq }` (Postgres caps NOTIFY at 8 KB); the listener fetches the row.
 */
export class PostgresEventBus implements EventBus {
  private listenClient: PoolClient | undefined;
  private listening = false;
  private readonly listeners = new Map<string, Set<(env: JobEventEnvelope) => void>>();

  constructor(private readonly pool: Pool) {}

  static async migrate(pool: Pool): Promise<void> {
    await pool.query(JOB_EVENTS_SCHEMA_SQL);
  }

  async publish(input: PublishInput): Promise<JobEventEnvelope> {
    const res = await this.pool.query(
      `insert into job_events (job_id, factio, data) values ($1, $2, $3) returning seq, ts`,
      [input.job_id, input.factio, JSON.stringify(input.data)],
    );
    const env: JobEventEnvelope = {
      ...input,
      seq: Number(res.rows[0].seq),
      ts: (res.rows[0].ts as Date).toISOString(),
    };
    await this.pool.query("select pg_notify($1, $2)", [
      CHANNEL,
      JSON.stringify({ job_id: input.job_id, seq: env.seq }),
    ]);
    return env;
  }

  async subscribe(jobId: string, onEvent: (env: JobEventEnvelope) => void): Promise<Unsubscribe> {
    let set = this.listeners.get(jobId);
    if (!set) {
      set = new Set();
      this.listeners.set(jobId, set);
    }
    set.add(onEvent);
    // Await LISTEN attachment so a subscribe-then-backfill caller can't miss events.
    await this.ensureListening();
    return () => {
      const current = this.listeners.get(jobId);
      if (!current) return;
      current.delete(onEvent);
      if (current.size === 0) this.listeners.delete(jobId);
    };
  }

  async replay(jobId: string, afterSeq: number): Promise<JobEventEnvelope[]> {
    const res = await this.pool.query(
      "select * from job_events where job_id = $1 and seq > $2 order by seq",
      [jobId, afterSeq],
    );
    return res.rows.map(rowToEnvelope);
  }

  /** Release the dedicated LISTEN connection (call on shutdown). */
  async close(): Promise<void> {
    if (!this.listenClient) return;
    this.listenClient.removeAllListeners("notification");
    this.listenClient.release();
    this.listenClient = undefined;
    this.listening = false;
  }

  private async ensureListening(): Promise<void> {
    if (this.listening) return;
    this.listening = true;
    try {
      const client = await this.pool.connect();
      this.listenClient = client;
      client.on("notification", (msg) => {
        void this.dispatch(msg.channel, msg.payload);
      });
      await client.query(`LISTEN ${CHANNEL}`);
    } catch (err) {
      this.listening = false;
      console.warn(`[auriga] event bus LISTEN failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async dispatch(channel: string, payload: string | undefined): Promise<void> {
    if (channel !== CHANNEL || !payload) return;
    let parsed: { job_id?: string; seq?: number };
    try {
      parsed = JSON.parse(payload);
    } catch {
      return;
    }
    const { job_id, seq } = parsed;
    if (!job_id || typeof seq !== "number") return;
    const set = this.listeners.get(job_id);
    if (!set || set.size === 0) return;
    const res = await this.pool.query("select * from job_events where seq = $1", [seq]);
    if (!res.rows[0]) return;
    const env = rowToEnvelope(res.rows[0]);
    for (const fn of set) {
      try {
        fn(env);
      } catch (err) {
        console.warn(
          `[auriga] event subscriber threw: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}

export interface SelectEventBusOptions {
  /** A Postgres pool. When present (and not overridden by `prefer`), the Postgres bus is used. */
  pool?: Pool;
  prefer?: "memory" | "postgres";
}

/**
 * Pick an {@link EventBus} driver, mirroring `selectDriver`: the Postgres
 * LISTEN/NOTIFY bus when a pool is provided (production cross-process), else the
 * in-memory bus (dev/tests/in-process).
 */
export function selectEventBus(opts: SelectEventBusOptions = {}): EventBus {
  const usePostgres =
    opts.prefer === "postgres" || (opts.prefer !== "memory" && Boolean(opts.pool));
  if (usePostgres) {
    if (!opts.pool) throw new Error("selectEventBus: prefer 'postgres' requires a pool");
    return new PostgresEventBus(opts.pool);
  }
  return new InMemoryEventBus();
}
