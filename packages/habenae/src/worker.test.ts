import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { textResponse, toolUseResponse, type JobEventEnvelope, type JobSpec } from "@auriga/core";
import { StubProvider } from "@auriga/provider";
import { LocalSandboxDriver } from "@auriga/sandbox";
import { InMemoryEventBus } from "./event-bus";
import { InMemoryJobStore } from "./memory-store";
import { Worker } from "./worker";

// An empty host directory used as the seed workspace ("dir" kind).
const EMPTY_WS = await mkdtemp(join(tmpdir(), "auriga-ws-"));

function spec(id: string): JobSpec {
  return {
    id,
    factio: "default",
    created_by: "test",
    goal: "create answer.txt",
    context_refs: { workspace: { kind: "dir", url_or_path: EMPTY_WS } },
    allowed_tools: ["write_file"],
    acceptance_criteria: [{ kind: "file_exists", path: "answer.txt" }],
    budget: { max_tokens: 100_000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 20 },
  };
}

test("runs a job to done and persists the final state", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("job_done"));
  const worker = new Worker({
    store,
    provider: new StubProvider([
      toolUseResponse("write_file", { path: "answer.txt", content: "x" }),
      textResponse("done"),
    ]),
    model: "stub",
    sandboxDriver: new LocalSandboxDriver(),
  });

  const result = await worker.run("job_done");
  expect(result.state).toBe("done");
  const record = await store.get("job_done");
  expect(record?.state).toBe("done");
  expect(record?.attempts).toBe(1);
});

test("persists a trace with model + verify events for the run", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("job_traced"));
  await new Worker({
    store,
    provider: new StubProvider([
      toolUseResponse("write_file", { path: "answer.txt", content: "x" }),
      textResponse("done"),
    ]),
    model: "stub",
    sandboxDriver: new LocalSandboxDriver(),
  }).run("job_traced");

  const trace = await store.loadTrace("job_traced");
  expect(trace?.result.state).toBe("done");
  expect(trace?.events.some((e) => e.type === "model_response")).toBe(true);
  expect(trace?.events.some((e) => e.type === "verify")).toBe(true);
});

test("publishes live state/trace/progress/done events that match the sealed trace", async () => {
  const store = new InMemoryJobStore();
  const bus = new InMemoryEventBus();
  await store.create(spec("job_live"));
  const seen: JobEventEnvelope[] = [];
  bus.subscribe("job_live", (e) => seen.push(e));

  await new Worker({
    store,
    provider: new StubProvider([
      toolUseResponse("write_file", { path: "answer.txt", content: "x" }),
      textResponse("done"),
    ]),
    model: "stub",
    sandboxDriver: new LocalSandboxDriver(),
    bus,
  }).run("job_live");

  // Delivery order is gap-free and matches the per-job monotonic seq.
  expect(seen.map((e) => e.seq)).toEqual(seen.map((_, i) => i + 1));
  // Lifecycle: first a state event (planning), last the terminal `done` sentinel.
  expect(seen[0]?.data.kind).toBe("state");
  expect(seen.at(-1)?.data).toMatchObject({ kind: "done", state: "done" });
  // A live progress (with cost) event was emitted for the attempt.
  expect(seen.some((e) => e.data.kind === "progress")).toBe(true);

  // The live `trace` envelopes carry exactly the sealed trace's events, in order —
  // so the live timeline and the sealed-trace viewer render from one source.
  const liveTraceEvents = seen
    .filter((e) => e.data.kind === "trace")
    .map((e) => (e.data as { kind: "trace"; event: unknown }).event);
  const sealed = await store.loadTrace("job_live");
  expect(liveTraceEvents).toEqual(sealed?.events ?? []);
});

test("require_approval pauses the job until approved, then completes (HITL)", async () => {
  const store = new InMemoryJobStore();
  await store.create({ ...spec("job_hitl"), require_approval: true });
  const worker = new Worker({
    store,
    provider: new StubProvider([
      toolUseResponse("write_file", { path: "answer.txt", content: "x" }),
      textResponse("done"),
    ]),
    model: "stub",
    sandboxDriver: new LocalSandboxDriver(),
  });

  const first = await worker.run("job_hitl");
  expect(first.state).toBe("paused");
  expect((await store.get("job_hitl"))?.state).toBe("paused");

  // a human approves, then the worker is re-run
  await store.update("job_hitl", { approved: true });
  const second = await worker.run("job_hitl");
  expect(second.state).toBe("done");
  expect((await store.get("job_hitl"))?.state).toBe("done");
});

test("a job with cancel_requested ends cancelled without running", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("job_cancel"));
  await store.update("job_cancel", { cancel_requested: true });
  const worker = new Worker({
    store,
    provider: new StubProvider([textResponse("should not run")]),
    model: "stub",
    sandboxDriver: new LocalSandboxDriver(),
  });

  const result = await worker.run("job_cancel");
  expect(result.state).toBe("cancelled");
  expect((await store.get("job_cancel"))?.state).toBe("cancelled");
});

test("resumes on a fresh worker after a crash, restoring workspace + transcript", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("job_resume"));

  // Worker 1: attempt 1 writes partial progress, verify fails, then "crash".
  const worker1 = new Worker({
    store,
    provider: new StubProvider([
      toolUseResponse("write_file", { path: "progress.txt", content: "wip" }),
      textResponse("partial"),
    ]),
    model: "stub",
    sandboxDriver: new LocalSandboxDriver(),
    crashAfterAttempt: 1,
  });
  await expect(worker1.run("job_resume")).rejects.toThrow(/crash/);

  // job remains running; checkpoint captured the partial workspace
  expect((await store.get("job_resume"))?.state).toBe("running");
  const cp = await store.loadCheckpoint("job_resume");
  expect(cp?.next_attempt).toBe(2);
  expect(cp?.workspace["progress.txt"]).toBeDefined();

  // Worker 2 (fresh) resumes: now completes the job.
  const worker2 = new Worker({
    store,
    provider: new StubProvider([
      toolUseResponse("write_file", { path: "answer.txt", content: "x" }),
      textResponse("now done"),
    ]),
    model: "stub",
    sandboxDriver: new LocalSandboxDriver(),
  });
  const result = await worker2.run("job_resume");
  expect(result.state).toBe("done");
  expect(result.attempts).toBe(2);
  expect((await store.get("job_resume"))?.state).toBe("done");
});
