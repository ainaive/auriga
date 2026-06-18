import type { JobState } from "./lifecycle";

/** A skill that was fetched, verified, and mounted during a run (recorded for audit/repro). */
export interface LoadedSkill {
  name: string;
  version: string;
  content_hash: string;
}

/** Cumulative budget consumption for a job. */
export interface BudgetSpent {
  tokens: number;
  wall_time_s: number;
  cost_usd: number;
  steps: number;
}

export const ZERO_BUDGET_SPENT: BudgetSpent = {
  tokens: 0,
  wall_time_s: 0,
  cost_usd: 0,
  steps: 0,
};

/**
 * Durable, resumable snapshot of a running job. Persisted by Habenae so a job can
 * resume on a different worker. `message_history` is provider-agnostic here and is
 * tightened to the canonical Message type once provider-types land (task 0.3).
 */
export interface Checkpoint {
  job_id: string;
  lifecycle_state: JobState;
  /** Index of the next loop step to execute. */
  step_cursor: number;
  message_history: readonly unknown[];
  /** The externalized todo list (filesystem-as-memory). */
  todo: string;
  /** Object-store ref for a large scratchpad, when offloaded. */
  scratchpad_ref?: string;
  loaded_skills: readonly LoadedSkill[];
  budget_spent: BudgetSpent;
}
