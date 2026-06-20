import { test, expect } from "bun:test";
import { InMemoryEventBus, liveEvent } from "./event-bus";

const state = (s: "planning" | "running" | "done") =>
  ({ kind: "state", state: s, reason: null }) as const;
const done = { kind: "done", state: "done", reason: null } as const;

test("publish assigns a monotonic per-job seq and a timestamp", async () => {
  const bus = new InMemoryEventBus();
  const a = await bus.publish(liveEvent("j1", "acme", state("planning")));
  const b = await bus.publish(liveEvent("j1", "acme", state("running")));
  expect(a.seq).toBe(1);
  expect(b.seq).toBe(2);
  expect(typeof a.ts).toBe("string");
  expect(a.job_id).toBe("j1");
  expect(a.factio).toBe("acme");
});

test("seq is independent per job", async () => {
  const bus = new InMemoryEventBus();
  const a = await bus.publish(liveEvent("j1", "acme", done));
  const b = await bus.publish(liveEvent("j2", "acme", done));
  expect(a.seq).toBe(1);
  expect(b.seq).toBe(1);
});

test("replay returns only events after the cursor, in order", async () => {
  const bus = new InMemoryEventBus();
  await bus.publish(liveEvent("j1", "acme", state("planning")));
  await bus.publish(liveEvent("j1", "acme", state("running")));
  await bus.publish(liveEvent("j1", "acme", done));

  expect((await bus.replay("j1", 0)).map((e) => e.seq)).toEqual([1, 2, 3]);
  expect((await bus.replay("j1", 2)).map((e) => e.seq)).toEqual([3]);
  expect(await bus.replay("j1", 3)).toEqual([]);
  expect(await bus.replay("unknown", 0)).toEqual([]);
});

test("subscribe receives live events until unsubscribed", async () => {
  const bus = new InMemoryEventBus();
  const seen: number[] = [];
  const unsub = await bus.subscribe("j1", (e) => seen.push(e.seq));
  await bus.publish(liveEvent("j1", "acme", state("planning")));
  await bus.publish(liveEvent("j1", "acme", state("running")));
  unsub();
  await bus.publish(liveEvent("j1", "acme", done));
  expect(seen).toEqual([1, 2]);
});

test("subscribers only receive their own job's events", async () => {
  const bus = new InMemoryEventBus();
  const seen: string[] = [];
  await bus.subscribe("j1", (e) => seen.push(e.job_id));
  await bus.publish(liveEvent("j2", "acme", done));
  await bus.publish(liveEvent("j1", "acme", done));
  expect(seen).toEqual(["j1"]);
});

test("a throwing subscriber breaks neither publish nor other subscribers", async () => {
  const bus = new InMemoryEventBus();
  const seen: number[] = [];
  await bus.subscribe("j1", () => {
    throw new Error("boom");
  });
  await bus.subscribe("j1", (e) => seen.push(e.seq));
  const env = await bus.publish(liveEvent("j1", "acme", done));
  expect(env.seq).toBe(1);
  expect(seen).toEqual([1]);
});
