/**
 * @auriga/habenae — the control plane ("the reins"): job/checkpoint persistence,
 * the queue, and the worker that drives Currus with checkpoint/resume.
 *
 * Two store/queue implementations behind one interface: in-memory + in-process
 * for dev/tests, Postgres + graphile-worker for production durability.
 */
export type {
  JobRecord,
  JobPatch,
  JobStore,
  Queue,
  WorkerCheckpoint,
} from "./types";
export { InMemoryJobStore, InProcessQueue } from "./memory-store";
export { FileJobStore } from "./file-store";
export { PostgresJobStore, migrate, SCHEMA_SQL } from "./postgres-store";
export { GraphileQueue, RUN_JOB_TASK } from "./graphile-queue";
export { Worker, type WorkerOptions } from "./worker";
