import { test, expect } from "bun:test";
import { ids, newId } from "./ids";

test("newId produces a prefixed id", () => {
  const id = newId("job");
  expect(id).toStartWith("job_");
  expect(id.length).toBe("job_".length + 24);
});

test("newId is unique across calls", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 1000; i++) seen.add(newId("x"));
  expect(seen.size).toBe(1000);
});

test("ids helpers carry their prefixes", () => {
  expect(ids.job()).toStartWith("job_");
  expect(ids.step()).toStartWith("step_");
  expect(ids.trace()).toStartWith("trace_");
  expect(ids.run()).toStartWith("run_");
});
