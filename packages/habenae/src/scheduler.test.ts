import { test, expect } from "bun:test";
import type { JobSpec, JobState } from "@auriga/core";
import { InMemoryJobStore } from "./memory-store";
import { Scheduler } from "./scheduler";

function spec(id: string, factio = "default", depends_on?: string[]): JobSpec {
  return {
    id,
    factio,
    created_by: "t",
    goal: "g",
    context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
    allowed_tools: [],
    acceptance_criteria: [{ kind: "file_exists", path: "x" }],
    budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
    ...(depends_on ? { depends_on } : {}),
  };
}

function concurrencyTracker() {
  let current = 0;
  let max = 0;
  return {
    enter() {
      current++;
      max = Math.max(max, current);
    },
    exit() {
      current--;
    },
    get max() {
      return max;
    },
  };
}

/** A controllable executor: marks running, observes concurrency, then sets the outcome. */
function makeRun(
  store: InMemoryJobStore,
  outcomes: Map<string, JobState>,
  opts: { tracker?: ReturnType<typeof concurrencyTracker>; order?: string[] } = {},
) {
  return async (id: string) => {
    await store.update(id, { state: "running" });
    opts.tracker?.enter();
    opts.order?.push(id);
    await new Promise((r) => setTimeout(r, 5));
    opts.tracker?.exit();
    await store.update(id, { state: outcomes.get(id) ?? "done" });
  };
}

test("invalid quotas are rejected at construction", () => {
  const store = new InMemoryJobStore();
  const run = async () => {};
  expect(() => new Scheduler({ store, run, quotas: { global: 0, perFactio: 1 } })).toThrow(
    /global/,
  );
  expect(() => new Scheduler({ store, run, quotas: { global: 1, perFactio: 0 } })).toThrow(
    /perFactio/,
  );
  expect(
    () =>
      new Scheduler({ store, run, quotas: { global: 1, perFactio: 1 }, retry: { maxRetries: -1 } }),
  ).toThrow(/maxRetries/);
});

test("global quota caps total concurrency", async () => {
  const store = new InMemoryJobStore();
  for (const id of ["a", "b", "c"]) await store.create(spec(id, `t-${id}`));
  const tracker = concurrencyTracker();
  const report = await new Scheduler({
    store,
    run: makeRun(store, new Map(), { tracker }),
    quotas: { global: 1, perFactio: 5 },
  }).drain();
  expect(tracker.max).toBe(1);
  expect(report.done.sort()).toEqual(["a", "b", "c"]);
});

test("per-tenant quota caps concurrency within a factio but allows cross-tenant parallelism", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("a1", "t1"));
  await store.create(spec("a2", "t1"));
  await store.create(spec("b1", "t2"));
  const tracker = concurrencyTracker();
  await new Scheduler({
    store,
    run: makeRun(store, new Map(), { tracker }),
    quotas: { global: 5, perFactio: 1 },
  }).drain();
  // t1 serialized (max 1 within t1) but t1+t2 run together → global max 2
  expect(tracker.max).toBe(2);
});

test("DAG: a dependent job runs only after its dependency is done", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("a"));
  await store.create(spec("b", "default", ["a"]));
  const order: string[] = [];
  const report = await new Scheduler({
    store,
    run: makeRun(store, new Map(), { order }),
    quotas: { global: 5, perFactio: 5 },
  }).drain();
  expect(order).toEqual(["a", "b"]);
  expect(report.done.sort()).toEqual(["a", "b"]);
});

test("a job whose dependency fails is marked blocked (failed)", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("a"));
  await store.create(spec("b", "default", ["a"]));
  const report = await new Scheduler({
    store,
    run: makeRun(store, new Map([["a", "failed"]])),
    quotas: { global: 5, perFactio: 5 },
  }).drain();
  expect(report.failed).toContain("a");
  expect(report.blocked).toContain("b");
  expect((await store.get("b"))?.state).toBe("failed");
});

test("a dependency cycle is resolved to blocked, not a hang", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("a", "default", ["b"]));
  await store.create(spec("b", "default", ["a"]));
  const report = await new Scheduler({
    store,
    run: makeRun(store, new Map()),
    quotas: { global: 5, perFactio: 5 },
  }).drain();
  expect(report.blocked.sort()).toEqual(["a", "b"]);
});
