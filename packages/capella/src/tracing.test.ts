import { test, expect } from "bun:test";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { textResponse, type Trace } from "@auriga/core";
import { emitSpans } from "./tracing";

function sampleTrace(): Trace {
  return {
    job_id: "job_x",
    model: "claude-sonnet-4-6",
    events: [
      { type: "model_response", step: 1, response: textResponse("done", { usage: { input_tokens: 5, output_tokens: 2 } }) },
      { type: "tool_call", step: 1, tool: "write_file", input: {}, output: "ok", isError: false },
      { type: "verify", attempt: 1, passed: true, criteria: [] },
    ],
    result: {
      state: "done",
      reason: "ok",
      attempts: 1,
      steps: 1,
      usage: { input_tokens: 5, output_tokens: 2 },
      loaded_skills: [],
    },
  };
}

test("emitSpans produces a root job span plus a child span per event", () => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const tracer = provider.getTracer("test");

  emitSpans(sampleTrace(), tracer);

  const spans = exporter.getFinishedSpans();
  const names = spans.map((s) => s.name);
  expect(names).toContain("job job_x");
  expect(names).toContain("gen_ai.model_response");
  expect(names).toContain("tool write_file");
  expect(names).toContain("verify attempt 1");
  expect(spans).toHaveLength(4); // root + 3 events

  const root = spans.find((s) => s.name === "job job_x");
  expect(root?.attributes["gen_ai.request.model"]).toBe("claude-sonnet-4-6");
});
