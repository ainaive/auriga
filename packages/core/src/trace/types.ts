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

/**
 * A live, incremental event streamed to clients watching a run (the browser
 * timeline). Unlike a {@link Trace} — which is sealed once at job end — these are
 * published as they happen so a UI can render the agent working step by step.
 * `trace` reuses the {@link TraceEvent} union verbatim so the live timeline and
 * the sealed-trace viewer share one renderer.
 */
export type JobLiveEvent =
  | { kind: "state"; state: JobState; reason: string | null }
  | { kind: "trace"; event: TraceEvent }
  | { kind: "progress"; attempt: number; steps: number; usage: Usage; cost_usd: number }
  | { kind: "done"; state: JobState; reason: string | null };

/**
 * A sequenced, tenant-tagged envelope around a {@link JobLiveEvent}. `seq` is
 * monotonic per `job_id` — it is the cursor a reconnecting client sends back as
 * `Last-Event-ID` to backfill what it missed before tailing live.
 */
export interface JobEventEnvelope {
  job_id: string;
  seq: number;
  ts: string;
  factio: string;
  data: JobLiveEvent;
}

/** The recorded model responses, in order — the input to deterministic replay. */
export function recordedResponses(trace: Trace): ModelResponse[] {
  return trace.events
    .filter(
      (e): e is Extract<TraceEvent, { type: "model_response" }> => e.type === "model_response",
    )
    .map((e) => e.response);
}
