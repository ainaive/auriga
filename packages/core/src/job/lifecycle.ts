import { ValidationError } from "../errors";

/**
 * Job lifecycle states. A job moves:
 *   pending → planning → running → verifying → done | failed | paused
 * `verifying` can loop back to `running` when the verification gate fails and the
 * loop retries. `done` and `failed` are terminal.
 */
export const JOB_STATES = [
  "pending",
  "planning",
  "running",
  "verifying",
  "done",
  "failed",
  "paused",
] as const;

export type JobState = (typeof JOB_STATES)[number];

export const TERMINAL_STATES: readonly JobState[] = ["done", "failed"];

export function isTerminal(state: JobState): boolean {
  return TERMINAL_STATES.includes(state);
}

/** Allowed forward transitions. The control plane (Habenae) enforces these. */
const TRANSITIONS: Record<JobState, readonly JobState[]> = {
  pending: ["planning", "failed"],
  planning: ["running", "paused", "failed"],
  running: ["verifying", "paused", "failed"],
  verifying: ["done", "running", "paused", "failed"],
  paused: ["planning", "running", "verifying", "failed"],
  done: [],
  failed: [],
};

export function canTransition(from: JobState, to: JobState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobState, to: JobState): void {
  if (!canTransition(from, to)) {
    throw new ValidationError(`illegal job transition: ${from} -> ${to}`);
  }
}
