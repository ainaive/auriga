import type { JobState } from "../job/lifecycle";
import type { LoadedSkill } from "../job/checkpoint";
import type { ModelResponse, Usage } from "../provider/types";

/**
 * A job trace: the ordered record of everything a run did. It is the substrate
 * for observability (OTel spans), cost accounting, deterministic replay, and
 * evals. The `model_response` events make a run replayable without the model.
 */

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
  | { type: "skill_loaded"; skill: LoadedSkill }
  | { type: "compaction"; dropped: number; before: number; after: number }
  | { type: "verify"; attempt: number; passed: boolean; criteria: VerifiedCriterion[] };

export interface TraceResult {
  state: JobState;
  reason: string;
  attempts: number;
  steps: number;
  usage: Usage;
  loaded_skills: LoadedSkill[];
}

export interface Trace {
  job_id: string;
  model: string;
  events: TraceEvent[];
  result: TraceResult;
}

/** The recorded model responses, in order — the input to deterministic replay. */
export function recordedResponses(trace: Trace): ModelResponse[] {
  return trace.events
    .filter(
      (e): e is Extract<TraceEvent, { type: "model_response" }> => e.type === "model_response",
    )
    .map((e) => e.response);
}
