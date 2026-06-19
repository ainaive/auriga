import { test, expect } from "bun:test";
import { textResponse, toolUseResponse } from "../provider/helpers";
import { recordedResponses, type Trace } from "./types";

function trace(events: Trace["events"]): Trace {
  return {
    job_id: "job_1",
    model: "stub",
    events,
    result: {
      state: "done",
      reason: "ok",
      attempts: 1,
      steps: 2,
      usage: { input_tokens: 0, output_tokens: 0 },
      loaded_skills: [],
    },
  };
}

test("recordedResponses extracts model responses in order", () => {
  const r1 = toolUseResponse("write_file", { path: "a" });
  const r2 = textResponse("done");
  const t = trace([
    { type: "model_response", step: 1, response: r1 },
    {
      type: "tool_call",
      step: 1,
      tool: "write_file",
      input: { path: "a" },
      output: "ok",
      isError: false,
    },
    { type: "verify", attempt: 1, passed: false, criteria: [] },
    { type: "model_response", step: 2, response: r2 },
  ]);
  const responses = recordedResponses(t);
  expect(responses).toHaveLength(2);
  expect(responses[0]).toBe(r1);
  expect(responses[1]).toBe(r2);
});

test("recordedResponses is empty when there are no model responses", () => {
  expect(
    recordedResponses(trace([{ type: "compaction", dropped: 3, before: 9, after: 4 }])),
  ).toEqual([]);
});
