import { isTerminal } from "@auriga/core";
import { dependencyStatus } from "./dag";
import type { JobStore } from "./types";

export interface SchedulerQuotas {
  /** Max jobs running across all tenants. */
  global: number;
  /** Max jobs running per tenant (factio). */
  perFactio: number;
}

export interface SchedulerReport {
  ran: string[];
  done: string[];
  failed: string[];
  paused: string[];
  /** Jobs marked failed because a dependency can never be satisfied. */
  blocked: string[];
}

export interface SchedulerOptions {
  store: JobStore;
  /** Execute a job to a terminal/paused state (e.g. a bound Worker.run). */
  run: (jobId: string) => Promise<unknown>;
  quotas: SchedulerQuotas;
}

/**
 * Drains pending jobs to completion while respecting:
 *  - global + per-tenant concurrency quotas,
 *  - the dependency DAG (a job runs only once its deps are `done`).
 * Jobs whose dependencies can never be satisfied (failed/missing dep, or a cycle)
 * are marked failed. Single event loop, so in-flight bookkeeping is race-free.
 */
export class Scheduler {
  constructor(private readonly opts: SchedulerOptions) {}

  async drain(): Promise<SchedulerReport> {
    const report: SchedulerReport = { ran: [], done: [], failed: [], paused: [], blocked: [] };
    const inflight = new Map<string, { factio: string; promise: Promise<string> }>();
    const factioCount = (f: string) =>
      [...inflight.values()].filter((v) => v.factio === f).length;

    for (;;) {
      const pending = (await this.opts.store.list()).filter(
        (r) => r.state === "pending" && !inflight.has(r.id),
      );

      for (const rec of pending) {
        const status = await dependencyStatus(this.opts.store, rec);
        if (status.failedDeps.length > 0) {
          await this.opts.store.update(rec.id, {
            state: "failed",
            reason: `blocked: dependency not satisfied (${status.failedDeps.join(", ")})`,
          });
          report.blocked.push(rec.id);
          continue;
        }
        if (!status.ready) continue; // waiting on deps still in progress
        if (inflight.size >= this.opts.quotas.global) continue;
        if (factioCount(rec.spec.factio) >= this.opts.quotas.perFactio) continue;

        report.ran.push(rec.id);
        const promise = Promise.resolve(this.opts.run(rec.id))
          .then(() => rec.id)
          .catch(() => rec.id);
        inflight.set(rec.id, { factio: rec.spec.factio, promise });
      }

      if (inflight.size === 0) {
        const stuck = (await this.opts.store.list()).filter((r) => r.state === "pending");
        for (const rec of stuck) {
          await this.opts.store.update(rec.id, {
            state: "failed",
            reason: "blocked: dependency not satisfied",
          });
          report.blocked.push(rec.id);
        }
        break;
      }

      const finishedId = await Promise.race([...inflight.values()].map((v) => v.promise));
      inflight.delete(finishedId);
      await this.settle(finishedId, report);
    }

    return report;
  }

  /** Classify a finished job by its persisted final state. */
  private async settle(jobId: string, report: SchedulerReport): Promise<void> {
    const rec = await this.opts.store.get(jobId);
    if (rec?.state === "done") {
      report.done.push(jobId);
    } else if (rec?.state === "paused") {
      report.paused.push(jobId);
    } else {
      // failed, or the executor threw and left a non-terminal state
      if (rec && !isTerminal(rec.state)) {
        await this.opts.store.update(jobId, { state: "failed", reason: "worker error" });
      }
      report.failed.push(jobId);
    }
  }
}
