import type { JobSpec } from "@auriga/core";
import type { JobPatch, JobRecord, JobStore, WorkerCheckpoint } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * In-memory JobStore for dev and tests. Two Worker instances sharing one store
 * exercise the same resume path as a fresh process against Postgres.
 */
export class InMemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly checkpoints = new Map<string, WorkerCheckpoint>();

  async create(spec: JobSpec): Promise<JobRecord> {
    if (this.jobs.has(spec.id)) throw new Error(`job already exists: ${spec.id}`);
    const now = nowIso();
    const record: JobRecord = {
      id: spec.id,
      spec,
      state: "pending",
      reason: null,
      model: null,
      usage: { input_tokens: 0, output_tokens: 0 },
      attempts: 0,
      steps: 0,
      loaded_skills: [],
      created_at: now,
      updated_at: now,
    };
    this.jobs.set(spec.id, structuredClone(record));
    return structuredClone(record);
  }

  async get(id: string): Promise<JobRecord | undefined> {
    const record = this.jobs.get(id);
    return record ? structuredClone(record) : undefined;
  }

  async list(): Promise<JobRecord[]> {
    return [...this.jobs.values()].map((r) => structuredClone(r));
  }

  async update(id: string, patch: JobPatch): Promise<void> {
    const record = this.jobs.get(id);
    if (!record) throw new Error(`job not found: ${id}`);
    Object.assign(record, patch, { updated_at: nowIso() });
  }

  async saveCheckpoint(checkpoint: WorkerCheckpoint): Promise<void> {
    if (!this.jobs.has(checkpoint.job_id)) {
      throw new Error(`job not found: ${checkpoint.job_id}`);
    }
    this.checkpoints.set(checkpoint.job_id, structuredClone(checkpoint));
  }

  async loadCheckpoint(jobId: string): Promise<WorkerCheckpoint | undefined> {
    const cp = this.checkpoints.get(jobId);
    return cp ? structuredClone(cp) : undefined;
  }
}

/** In-process FIFO queue for dev/tests. */
export class InProcessQueue {
  private readonly items: string[] = [];

  async enqueue(jobId: string): Promise<void> {
    this.items.push(jobId);
  }

  /** Drain the queue, invoking handler for each job id in order. */
  async drain(handler: (jobId: string) => Promise<void>): Promise<void> {
    let next = this.items.shift();
    while (next !== undefined) {
      await handler(next);
      next = this.items.shift();
    }
  }

  get size(): number {
    return this.items.length;
  }
}
