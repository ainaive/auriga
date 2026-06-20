import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { JobEventEnvelope, JobSpec, Trace } from "@auriga/core";
import { Pool } from "pg";
import { PostgresAuditLog } from "./audit";
import { PostgresEventBus } from "./event-bus";
import { GraphileQueue } from "./graphile-queue";
import { migrate, PostgresJobStore } from "./postgres-store";

// Live Postgres tests — gated on DATABASE_URL so the default `bun run check`
// stays hermetic. Exercised by the CI `integration` job (postgres service).
const DATABASE_URL = process.env.DATABASE_URL;

function spec(id: string, factio: string): JobSpec {
  return {
    id,
    factio,
    created_by: "u",
    goal: "g",
    context_refs: { workspace: { kind: "git", url_or_path: "x" } },
    allowed_tools: [],
    acceptance_criteria: [{ kind: "file_exists", path: "x" }],
    budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
  };
}

describe.if(Boolean(DATABASE_URL))("Postgres integration", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
    await migrate(pool);
    await PostgresAuditLog.migrate(pool);
    await PostgresEventBus.migrate(pool);
  });

  // Reset per-test so outcomes don't depend on execution order.
  beforeEach(async () => {
    await pool.query("truncate jobs, checkpoints, traces, job_events cascade");
    await pool.query("truncate audit_events");
  });

  afterAll(async () => {
    await pool?.end();
  });

  test("PostgresJobStore: CRUD + checkpoint + trace + tenant isolation", async () => {
    const store = new PostgresJobStore(pool);

    const created = await store.create(spec("pg1", "t1"));
    expect(created.state).toBe("pending");
    expect(created.retries).toBe(0);

    await store.update("pg1", {
      state: "running",
      retries: 1,
      approved: true,
      model: "claude-sonnet-4-6",
    });
    const got = await store.get("pg1");
    expect(got?.state).toBe("running");
    expect(got?.retries).toBe(1);
    expect(got?.approved).toBe(true);

    await store.create(spec("pg2", "t2"));
    expect((await store.listByFactio("t1")).map((r) => r.id)).toEqual(["pg1"]);

    await store.saveCheckpoint({
      job_id: "pg1",
      lifecycle_state: "running",
      messages: [],
      usage: { input_tokens: 1, output_tokens: 2 },
      steps: 3,
      next_attempt: 2,
      loaded_skills: [],
      workspace: { "a.txt": "eA==" },
    });
    expect((await store.loadCheckpoint("pg1"))?.next_attempt).toBe(2);

    const trace: Trace = {
      job_id: "pg1",
      model: "stub",
      events: [],
      result: {
        state: "done",
        reason: "ok",
        attempts: 1,
        steps: 3,
        usage: { input_tokens: 1, output_tokens: 2 },
        loaded_skills: [],
      },
    };
    await store.saveTrace(trace);
    expect((await store.loadTrace("pg1"))?.model).toBe("stub");

    await expect(store.update("ghost", { state: "done" })).rejects.toThrow(/not found/);
  });

  test("PostgresAuditLog: recent-first, tenant filter, and append-only triggers", async () => {
    const audit = new PostgresAuditLog(pool);
    await audit.record({ factio: "t1", actor: "u", action: "job.created", job_id: "pg1" });
    await audit.record({ factio: "t1", actor: "u", action: "job.completed", job_id: "pg1" });

    const all = await audit.list();
    expect(all[0]?.action).toBe("job.completed");
    expect((await audit.listByFactio("t1")).length).toBeGreaterThanOrEqual(2);

    // DB-level append-only: UPDATE/DELETE rejected by the triggers
    await expect(pool.query("update audit_events set action = 'x'")).rejects.toThrow(/append-only/);
    await expect(pool.query("delete from audit_events")).rejects.toThrow(/append-only/);
  });

  test("PostgresEventBus: monotonic seq, replay backfill, and cross-connection NOTIFY", async () => {
    const publisher = new PostgresEventBus(pool);
    // A second pool/connection subscribes — simulating the API process tailing events
    // published by a separate graphile-worker process.
    const subPool = new Pool({ connectionString: DATABASE_URL });
    const subscriber = new PostgresEventBus(subPool);
    const received: JobEventEnvelope[] = [];
    const unsub = await subscriber.subscribe("pg_evt", (e) => received.push(e));

    const a = await publisher.publish({
      job_id: "pg_evt",
      factio: "t1",
      data: { kind: "state", state: "planning", reason: null },
    });
    const b = await publisher.publish({
      job_id: "pg_evt",
      factio: "t1",
      data: { kind: "done", state: "done", reason: null },
    });
    expect(b.seq).toBeGreaterThan(a.seq);

    // Durable backfill, in order + after-cursor filtering.
    const all = await publisher.replay("pg_evt", 0);
    expect(all.map((e) => e.data.kind)).toEqual(["state", "done"]);
    expect(await publisher.replay("pg_evt", a.seq)).toHaveLength(1);

    // NOTIFY fanned the events out to the other connection.
    await new Promise((r) => setTimeout(r, 400));
    expect(received.map((e) => e.data.kind)).toEqual(["state", "done"]);

    unsub();
    await subscriber.close();
    await subPool.end();
  });

  test("GraphileQueue: migrate + enqueue against the live DB", async () => {
    const queue = await GraphileQueue.connect(DATABASE_URL as string);
    try {
      await queue.enqueue("pg1");
    } finally {
      await queue.close();
    }
  });
});

if (!DATABASE_URL) {
  test.skip("Postgres integration (set DATABASE_URL to run)", () => {});
}
