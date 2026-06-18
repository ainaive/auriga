import { test, expect } from "bun:test";
import { textResponse, toolUseResponse, type TraceResult } from "@auriga/core";
import { Recorder } from "./recorder";
import { traceCost } from "./rollup";
import { formatTrace } from "./format";

const RESULT: TraceResult = {
  state: "done",
  reason: "acceptance criteria passed",
  attempts: 1,
  steps: 2,
  usage: { input_tokens: 17, output_tokens: 8 },
  loaded_skills: [],
};

test("Recorder collects events and seals a trace", () => {
  const rec = new Recorder("job_1", "claude-sonnet-4-6");
  rec.record({
    type: "model_response",
    step: 1,
    response: toolUseResponse("write_file", { path: "a" }, { usage: { input_tokens: 10, output_tokens: 5 } }),
  });
  rec.record({ type: "tool_call", step: 1, tool: "write_file", input: { path: "a" }, output: "ok", isError: false });
  rec.record({ type: "model_response", step: 2, response: textResponse("done", { usage: { input_tokens: 7, output_tokens: 3 } }) });
  const t = rec.finish(RESULT);
  expect(t.job_id).toBe("job_1");
  expect(t.events).toHaveLength(3);
  expect(t.result.state).toBe("done");
});

test("traceCost rolls up tokens + cost from model_response events", () => {
  const rec = new Recorder("job_1", "claude-sonnet-4-6");
  rec.record({ type: "model_response", step: 1, response: textResponse("a", { usage: { input_tokens: 1_000_000, output_tokens: 0 } }) });
  const cost = traceCost(rec.finish(RESULT));
  expect(cost.model_calls).toBe(1);
  expect(cost.usage.input_tokens).toBe(1_000_000);
  expect(cost.cost_usd).toBeCloseTo(3, 5); // sonnet: $3 / 1M input
});

test("formatTrace renders events and a cost footer", () => {
  const rec = new Recorder("job_1", "claude-sonnet-4-6");
  rec.record({ type: "model_response", step: 1, response: textResponse("done", { usage: { input_tokens: 10, output_tokens: 5 } }) });
  rec.record({ type: "verify", attempt: 1, passed: true, criteria: [] });
  const out = formatTrace(rec.finish(RESULT));
  expect(out).toContain("job job_1");
  expect(out).toContain("verify attempt 1: PASS");
  expect(out).toContain("cost:");
});
