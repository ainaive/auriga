import { test, expect } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { textResponse, toolUseResponse, type JobSpec } from "@auriga/core";
import { StubProvider } from "@auriga/provider";
import { LocalSandboxDriver } from "@auriga/sandbox";
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
