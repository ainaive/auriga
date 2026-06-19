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
  /** Live tail. Returns an unsubscribe fn; the callback receives every event after subscription. */
  subscribe(jobId: string, onEvent: (env: JobEventEnvelope) => void): Unsubscribe;
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

  subscribe(jobId: string, onEvent: (env: JobEventEnvelope) => void): Unsubscribe {
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
