// Console-side mirror of the @auriga/core run + trace + live-event types. The
// console is a thin client; it keeps a local copy rather than importing the Bun
// workspace packages (avoids transpiling server packages into the Next bundle).
// Unifying these onto @auriga/core directly is a later refinement.

export type JobState =
  | "pending"
  | "planning"
  | "running"
  | "verifying"
  | "done"
  | "failed"
  | "paused"
  | "cancelled";

export const ACTIVE_STATES: JobState[] = ["planning", "running", "verifying"];
export const TERMINAL_STATES: JobState[] = ["done", "failed", "cancelled"];

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

export interface ModelResponse {
  content: ContentBlock[];
  stop_reason: string;
  usage: Usage;
  model: string;
}

export interface VerifiedCriterion {
  kind: string;
  passed: boolean;
  evidence: string;
}

export type TraceEvent =
  | { type: "model_response"; step: number; response: ModelResponse }
  | {
      type: "tool_call";
      step: number;
      tool: string;
      input: Record<string, unknown>;
      output: string;
      isError: boolean;
    }
  | { type: "skill_loaded"; skill: { name: string; version: string; content_hash: string } }
  | { type: "compaction"; dropped: number; before: number; after: number }
  | { type: "verify"; attempt: number; passed: boolean; criteria: VerifiedCriterion[] };

/** A live, incremental event streamed over SSE while a run is in flight. */
export type JobLiveEvent =
  | { kind: "state"; state: JobState; reason: string | null }
  | { kind: "trace"; event: TraceEvent }
  | { kind: "progress"; attempt: number; steps: number; usage: Usage; cost_usd: number }
  | { kind: "done"; state: JobState; reason: string | null };
