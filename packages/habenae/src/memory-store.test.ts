import { test, expect } from "bun:test";
import type { JobSpec } from "@auriga/core";
import { InMemoryJobStore, InProcessQueue } from "./memory-store";

function spec(id: string): JobSpec {
  return {
    id,
    factio: "default",
    created_by: "test",
    goal: "g",
    context_refs: { workspace: { kind: "git", url_or_path: "x" } },
    allowed_tools: [],
    acceptance_criteria: [{ kind: "file_exists", path: "x" }],
    budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
  };
}

test("create / get / list / update round trip", async () => {
  const store = new InMemoryJobStore();
  const created = await store.create(spec("job_1"));
  expect(created.state).toBe("pending");

  await store.update("job_1", { state: "running", steps: 3 });
  const got = await store.get("job_1");
  expect(got?.state).toBe("running");
  expect(got?.steps).toBe(3);

  await store.create(spec("job_2"));
  expect((await store.list()).map((r) => r.id).sort()).toEqual(["job_1", "job_2"]);
});

test("get returns a copy (no external mutation)", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("job_1"));
  const a = await store.get("job_1");
  a!.state = "done";
  const b = await store.get("job_1");
  expect(b?.state).toBe("pending");
});

test("checkpoint save / load round trip", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("job_1"));
  await store.saveCheckpoint({
    job_id: "job_1",
    lifecycle_state: "running",
    messages: [],
    usage: { input_tokens: 1, output_tokens: 2 },
    steps: 4,
    next_attempt: 2,
    loaded_skills: [],
    workspace: { "a.txt": "eA==" },
  });
  const cp = await store.loadCheckpoint("job_1");
  expect(cp?.next_attempt).toBe(2);
  expect(cp?.workspace["a.txt"]).toBe("eA==");
});

test("in-process queue drains FIFO", async () => {
  const queue = new InProcessQueue();
  await queue.enqueue("a");
  await queue.enqueue("b");
  const seen: string[] = [];
  await queue.drain(async (id) => {
    seen.push(id);
  });
  expect(seen).toEqual(["a", "b"]);
  expect(queue.size).toBe(0);
});
