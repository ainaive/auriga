import { isTerminal } from "@auriga/core";
import type { JobRecord, JobStore } from "./types";

/** Active = occupying a concurrency slot (not pending, not terminal/paused). */
const ACTIVE = new Set(["planning", "running", "verifying"]);

export function isActive(record: JobRecord): boolean {
  return ACTIVE.has(record.state);
}

export interface DependencyStatus {
  ready: boolean;
  /** Deps that ended in a non-done terminal state — this job can never run. */
  failedDeps: string[];
  /** Deps not yet done (and not failed). */
  pendingDeps: string[];
}

/**
 * Resolve a job's dependency readiness:
 *  - ready when every dependency is `done`,
 *  - blocked (failedDeps) when a dependency is terminal but not `done`,
 *  - waiting (pendingDeps) otherwise.
 * A missing dependency is treated as a failed dep (can never be satisfied).
 */
export async function dependencyStatus(
  store: JobStore,
  record: JobRecord,
): Promise<DependencyStatus> {
  const deps = record.spec.depends_on ?? [];
  const failedDeps: string[] = [];
  const pendingDeps: string[] = [];
  for (const depId of deps) {
    const dep = await store.get(depId);
    if (!dep) {
      failedDeps.push(depId);
    } else if (dep.state === "done") {
      // satisfied
    } else if (isTerminal(dep.state)) {
      failedDeps.push(depId);
    } else {
      pendingDeps.push(depId);
    }
  }
  return { ready: failedDeps.length === 0 && pendingDeps.length === 0, failedDeps, pendingDeps };
}
