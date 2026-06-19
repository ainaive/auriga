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
export { isActive, dependencyStatus, type DependencyStatus } from "./dag";
export {
  Scheduler,
  type SchedulerOptions,
  type SchedulerQuotas,
  type SchedulerReport,
  type RetryPolicy,
} from "./scheduler";
export {
  submitJob,
  InMemoryPolicy,
  type Policy,
  type FactioPolicy,
  type Actor,
  type SubmitOptions,
} from "./governance";
export {
  InMemoryAuditLog,
  FileAuditLog,
  PostgresAuditLog,
  safeAudit,
  AUDIT_SCHEMA_SQL,
  type AuditLog,
  type AuditEvent,
  type NewAuditEvent,
} from "./audit";
export {
  buildDashboard,
  type DashboardData,
  type TenantSummary,
} from "./dashboard";
export {
  type AurigaConfig,
  type ConfigStore,
  InMemoryConfigStore,
  FileConfigStore,
  StoreBackedPolicy,
  ConfigSchema,
  parseConfig,
  DEFAULT_CONFIG,
} from "./config-store";
export { PostgresJobStore, migrate, SCHEMA_SQL } from "./postgres-store";
export { GraphileQueue, RUN_JOB_TASK } from "./graphile-queue";
export { Worker, type WorkerOptions } from "./worker";
