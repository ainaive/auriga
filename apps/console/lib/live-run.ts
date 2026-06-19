// Pure reducer that folds the SSE event stream into a view model for the live-run
// UI. Kept free of React/DOM so it is unit-testable in isolation (Vitest).

import type { JobLiveEvent, JobState, TraceEvent, Usage } from "@/lib/types";
import { TERMINAL_STATES } from "@/lib/types";

export interface LiveRunState {
  state: JobState;
  reason: string | null;
  attempt: number;
  steps: number;
  usage: Usage;
  cost_usd: number;
  /** Ordered trace events — the step timeline. */
  trace: TraceEvent[];
  terminal: boolean;
}

export interface LiveRunSeed {
  state: JobState;
  reason?: string | null;
  attempt?: number;
  steps?: number;
  usage?: Usage;
  cost_usd?: number;
  trace?: TraceEvent[];
}

export function initLiveRun(seed: LiveRunSeed): LiveRunState {
  return {
    state: seed.state,
    reason: seed.reason ?? null,
    attempt: seed.attempt ?? 0,
    steps: seed.steps ?? 0,
    usage: seed.usage ?? { input_tokens: 0, output_tokens: 0 },
    cost_usd: seed.cost_usd ?? 0,
    trace: seed.trace ? [...seed.trace] : [],
    terminal: TERMINAL_STATES.includes(seed.state),
  };
}

/** Fold one live event into the running view model. Pure — returns a new state. */
export function reduceLiveRun(s: LiveRunState, e: JobLiveEvent): LiveRunState {
  switch (e.kind) {
    case "state":
      return { ...s, state: e.state, reason: e.reason, terminal: TERMINAL_STATES.includes(e.state) };
    case "progress":
      return { ...s, attempt: e.attempt, steps: e.steps, usage: e.usage, cost_usd: e.cost_usd };
    case "trace":
      return { ...s, trace: [...s.trace, e.event] };
    case "done":
      return { ...s, state: e.state, reason: e.reason, terminal: true };
    default:
      return s;
  }
}
