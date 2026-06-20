import { describe, expect, it } from "vitest";
import { initLiveRun, reduceLiveRun } from "@/lib/live-run";
import type { JobLiveEvent } from "@/lib/types";

const fold = (events: JobLiveEvent[], seed = initLiveRun({ state: "pending" })) =>
  events.reduce(reduceLiveRun, seed);

describe("live-run reducer", () => {
  it("seeds from the initial server record", () => {
    const s = initLiveRun({ state: "running", attempt: 1, steps: 3 });
    expect(s.state).toBe("running");
    expect(s.terminal).toBe(false);
    expect(s.attempt).toBe(1);
    expect(s.trace).toHaveLength(0);
  });

  it("accumulates trace events in order", () => {
    const s = fold([
      {
        kind: "trace",
        event: {
          type: "model_response",
          step: 1,
          response: {
            content: [{ type: "text", text: "hi" }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1, output_tokens: 1 },
            model: "stub",
          },
        },
      },
      {
        kind: "trace",
        event: { type: "tool_call", step: 1, tool: "write_file", input: {}, output: "ok", isError: false },
      },
    ]);
    expect(s.trace.map((e) => e.type)).toEqual(["model_response", "tool_call"]);
  });

  it("tracks progress (attempt/steps/usage/cost)", () => {
    const s = fold([
      {
        kind: "progress",
        attempt: 2,
        steps: 5,
        usage: { input_tokens: 10, output_tokens: 4 },
        cost_usd: 0.012,
      },
    ]);
    expect(s.attempt).toBe(2);
    expect(s.steps).toBe(5);
    expect(s.usage.input_tokens).toBe(10);
    expect(s.cost_usd).toBeCloseTo(0.012);
  });

  it("flags terminal on a terminal state event but not on an active one", () => {
    expect(fold([{ kind: "state", state: "failed", reason: "x" }]).terminal).toBe(true);
    expect(fold([{ kind: "state", state: "running", reason: null }]).terminal).toBe(false);
  });

  it("records the reason and marks terminal on done", () => {
    const s = fold([{ kind: "done", state: "done", reason: "criteria passed" }]);
    expect(s.state).toBe("done");
    expect(s.terminal).toBe(true);
    expect(s.reason).toBe("criteria passed");
  });

  it("is pure — it never mutates the previous state", () => {
    const a = initLiveRun({ state: "running" });
    const b = reduceLiveRun(a, {
      kind: "trace",
      event: { type: "compaction", dropped: 2, before: 10, after: 8 },
    });
    expect(a.trace).toHaveLength(0);
    expect(b.trace).toHaveLength(1);
  });
});
