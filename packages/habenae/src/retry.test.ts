import { test, expect } from "bun:test";
import type { JobSpec } from "@auriga/core";
import { InMemoryJobStore } from "./memory-store";
import { Scheduler } from "./scheduler";

function spec(id: string): JobSpec {
  return {
    id,
    factio: "default",
    created_by: "t",
    goal: "g",
    context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
    allowed_tools: [],
    acceptance_criteria: [{ kind: "file_exists", path: "x" }],
    budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
  };
}

/** Fails until the job has accumulated `succeedAtRetry` retries, then succeeds. */
function makeRun(store: InMemoryJobStore, succeedAtRetry: number) {
  return async (id: string) => {
    const rec = await store.get(id);
    const retries = rec?.retries ?? 0;
    await store.update(id, { state: "running" });
    await new Promise((r) => setTimeout(r, 1));
    await store.update(id, { state: retries >= succeedAtRetry ? "done" : "failed" });
  };
}

test("a transient failure is retried and then succeeds", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("j"));
  const report = await new Scheduler({
    store,
    run: makeRun(store, 2), // fails at retries 0 and 1, succeeds at 2
    quotas: { global: 1, perFactio: 1 },
    retry: { maxRetries: 3 },
  }).drain();

  expect(report.done).toContain("j");
  expect(report.retried.filter((x) => x === "j")).toHaveLength(2);
  expect((await store.get("j"))?.retries).toBe(2);
});

test("retries are bounded; an always-failing job ends failed", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("j"));
  const report = await new Scheduler({
    store,
    run: makeRun(store, 99), // never succeeds
    quotas: { global: 1, perFactio: 1 },
    retry: { maxRetries: 2 },
  }).drain();

  expect(report.failed).toContain("j");
  expect(report.retried.filter((x) => x === "j")).toHaveLength(2);
  expect((await store.get("j"))?.retries).toBe(2);
  expect((await store.get("j"))?.state).toBe("failed");
});

test("backoff is consulted for each retry", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("j"));
  const attempts: number[] = [];
  await new Scheduler({
    store,
    run: makeRun(store, 99),
    quotas: { global: 1, perFactio: 1 },
    retry: {
      maxRetries: 2,
      backoffMs: (attempt) => {
        attempts.push(attempt);
        return 0;
      },
    },
  }).drain();
  expect(attempts).toEqual([1, 2]);
});
