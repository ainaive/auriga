// One source of truth for which lifecycle actions a job affords — shared by the
// job-detail page and the jobs-list rows. Pure; unit-tested in Vitest.

import { ACTIVE_STATES, TERMINAL_STATES, type JobState } from "@/lib/types";

export interface JobActionTarget {
  state: JobState;
  approved: boolean;
  spec: { require_approval?: boolean };
}

export interface JobActions {
  active: boolean;
  terminal: boolean;
  /** Paused awaiting HITL approval (not yet approved). */
  needsApproval: boolean;
  /** Paused by the user (not awaiting approval) — Run shows as "Resume". */
  resumable: boolean;
  runnable: boolean;
  pausable: boolean;
  cancellable: boolean;
}

export function jobActions(job: JobActionTarget): JobActions {
  const active = ACTIVE_STATES.includes(job.state);
  const terminal = TERMINAL_STATES.includes(job.state);
  const needsApproval = job.state === "paused" && !!job.spec.require_approval && !job.approved;
  const resumable = job.state === "paused" && !needsApproval;
  // Runnable: not active, not done, not awaiting approval (pending/failed/cancelled re-run; paused resume).
  const runnable = !active && job.state !== "done" && !needsApproval;
  return { active, terminal, needsApproval, resumable, runnable, pausable: active, cancellable: !terminal };
}
