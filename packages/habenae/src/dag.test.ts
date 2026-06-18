import { test, expect } from "bun:test";
import type { JobSpec } from "@auriga/core";
import { InMemoryJobStore } from "./memory-store";
import { dependencyStatus, isActive } from "./dag";

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

test("new jobs start with retries = 0", async () => {
  const store = new InMemoryJobStore();
  const rec = await store.create(spec("j"));
  expect(rec.retries).toBe(0);
});

test("listByFactio isolates tenants", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("a", "t1"));
  await store.create(spec("b", "t2"));
  await store.create(spec("c", "t1"));
  expect((await store.listByFactio("t1")).map((r) => r.id).sort()).toEqual(["a", "c"]);
  expect((await store.listByFactio("t2")).map((r) => r.id)).toEqual(["b"]);
});

test("a job with no deps is ready", async () => {
  const store = new InMemoryJobStore();
  const rec = await store.create(spec("j"));
  expect((await dependencyStatus(store, rec)).ready).toBe(true);
});

test("becomes ready only once all deps are done", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("a"));
  const b = await store.create(spec("b", "default", ["a"]));
  let status = await dependencyStatus(store, b);
  expect(status.ready).toBe(false);
  expect(status.pendingDeps).toEqual(["a"]);

  await store.update("a", { state: "done" });
  status = await dependencyStatus(store, b);
  expect(status.ready).toBe(true);
});

test("a failed dependency blocks the job", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("a"));
  await store.update("a", { state: "failed" });
  const b = await store.create(spec("b", "default", ["a"]));
  const status = await dependencyStatus(store, b);
  expect(status.ready).toBe(false);
  expect(status.failedDeps).toEqual(["a"]);
});

test("a missing dependency is treated as failed", async () => {
  const store = new InMemoryJobStore();
  const b = await store.create(spec("b", "default", ["ghost"]));
  const status = await dependencyStatus(store, b);
  expect(status.failedDeps).toEqual(["ghost"]);
});

test("isActive reflects occupying a concurrency slot", async () => {
  const store = new InMemoryJobStore();
  const rec = await store.create(spec("j"));
  expect(isActive(rec)).toBe(false); // pending
  await store.update("j", { state: "running" });
  expect(isActive((await store.get("j"))!)).toBe(true);
  await store.update("j", { state: "done" });
  expect(isActive((await store.get("j"))!)).toBe(false);
});
