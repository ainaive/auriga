import type { JobSpec, JobState, LoadedSkill, Message, Trace, Usage } from "@auriga/core";
import type { SandboxSnapshot } from "@auriga/sandbox";

/** The persisted job row. */
export interface JobRecord {
  id: string;
  spec: JobSpec;
  state: JobState;
  reason: string | null;
  /** Model used to run the job (for cost accounting). */
  model: string | null;
  /** Human approval granted (HITL gate). */
  approved: boolean;
  /** Number of control-plane retries already consumed. */
  retries: number;
  usage: Usage;
  attempts: number;
  steps: number;
  loaded_skills: LoadedSkill[];
  created_at: string;
  updated_at: string;
}

/** A durable, resumable snapshot of a job between PEV attempts. */
export interface WorkerCheckpoint {
  job_id: string;
  lifecycle_state: JobState;
  messages: Message[];
  usage: Usage;
  steps: number;
  /** The next attempt to run on resume. */
  next_attempt: number;
  loaded_skills: LoadedSkill[];
  /** Workspace snapshot so file edits survive a fresh worker. */
  workspace: SandboxSnapshot;
}

export type JobPatch = Partial<Omit<JobRecord, "id" | "spec" | "created_at">>;

/** Persistence for jobs + checkpoints + traces. In-memory (dev/tests) and Postgres (prod). */
export interface JobStore {
  create(spec: JobSpec): Promise<JobRecord>;
  get(id: string): Promise<JobRecord | undefined>;
  list(): Promise<JobRecord[]>;
  /** Tenant-scoped listing (multi-tenant isolation). */
  listByFactio(factio: string): Promise<JobRecord[]>;
  update(id: string, patch: JobPatch): Promise<void>;
  saveCheckpoint(checkpoint: WorkerCheckpoint): Promise<void>;
  loadCheckpoint(jobId: string): Promise<WorkerCheckpoint | undefined>;
  saveTrace(trace: Trace): Promise<void>;
  loadTrace(jobId: string): Promise<Trace | undefined>;
}

/** A durable job queue. In-process (dev/tests) and graphile-worker (prod). */
export interface Queue {
  enqueue(jobId: string): Promise<void>;
}
