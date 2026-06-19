import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RunTimeline } from "@/components/run-timeline";
import type { TraceEvent } from "@/lib/types";

describe("RunTimeline", () => {
  it("shows an empty state when there are no events", () => {
    render(<RunTimeline events={[]} />);
    expect(screen.getByText(/no steps yet/i)).toBeInTheDocument();
  });

  it("renders model text, tool output, and a verify result", () => {
    const events: TraceEvent[] = [
      {
        type: "model_response",
        step: 1,
        response: {
          content: [
            { type: "text", text: "thinking" },
            { type: "tool_use", name: "write_file" },
          ],
          stop_reason: "tool_use",
          usage: { input_tokens: 1, output_tokens: 1 },
          model: "stub",
        },
      },
      { type: "tool_call", step: 1, tool: "write_file", input: { path: "a" }, output: "wrote a", isError: false },
      { type: "verify", attempt: 1, passed: true, criteria: [{ kind: "file_exists", passed: true, evidence: "exists" }] },
    ];
    render(<RunTimeline events={events} />);
    expect(screen.getByText("thinking")).toBeInTheDocument();
    expect(screen.getByText("→ write_file")).toBeInTheDocument();
    expect(screen.getByText("write_file")).toBeInTheDocument(); // tool_call row title
    expect(screen.getByText("wrote a")).toBeInTheDocument();
    expect(screen.getByText(/Verify · attempt 1/)).toBeInTheDocument();
    expect(screen.getByText("passed")).toBeInTheDocument();
  });

  it("flags a failed tool call and shows failed verify evidence", () => {
    const events: TraceEvent[] = [
      { type: "tool_call", step: 2, tool: "run", input: {}, output: "boom", isError: true },
      {
        type: "verify",
        attempt: 1,
        passed: false,
        criteria: [{ kind: "command", passed: false, evidence: "exit 1" }],
      },
    ];
    render(<RunTimeline events={events} />);
    expect(screen.getByText(/step 2/)).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
    expect(screen.getByText(/exit 1/)).toBeInTheDocument();
  });
});
