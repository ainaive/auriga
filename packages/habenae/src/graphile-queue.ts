import { makeWorkerUtils, type WorkerUtils } from "graphile-worker";
import type { Queue } from "./types";

export const RUN_JOB_TASK = "run_job";

/**
 * Durable queue backed by graphile-worker (Postgres). Verified against a live
 * database. Pair with a graphile-worker runner that registers a `run_job` task
 * dispatching to the Worker. The in-process queue mirrors this for local dev.
 */
export class GraphileQueue implements Queue {
  private constructor(private readonly utils: WorkerUtils) {}

  static async connect(connectionString: string): Promise<GraphileQueue> {
    const utils = await makeWorkerUtils({ connectionString });
    await utils.migrate();
    return new GraphileQueue(utils);
  }

  async enqueue(jobId: string): Promise<void> {
    await this.utils.addJob(RUN_JOB_TASK, { jobId });
  }

  async close(): Promise<void> {
    await this.utils.release();
  }
}
