import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { JobSpec, Trace } from "@auriga/core";
import type { JobPatch, JobRecord, JobStore, WorkerCheckpoint } from "./types";

/**
 * JSON-file-backed JobStore for local single-machine use (e.g. the CLI), so
 * `submit` then `status`/`result` work across separate process invocations
 * without Postgres. Postgres remains the production store.
 */
export class FileJobStore implements JobStore {
  constructor(private readonly dir: string) {}

  /** Reject ids that could escape the store directory via path traversal. */
  private assertSafeId(id: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`invalid job id: ${id}`);
  }

  private jobPath(id: string): string {
    this.assertSafeId(id);
    return join(this.dir, `${id}.json`);
  }

  private checkpointPath(id: string): string {
    this.assertSafeId(id);
    return join(this.dir, `${id}.checkpoint.json`);
  }

  private tracePath(id: string): string {
    this.assertSafeId(id);
    return join(this.dir, `${id}.trace.json`);
  }

  async create(spec: JobSpec): Promise<JobRecord> {
    await mkdir(this.dir, { recursive: true });
    const now = new Date().toISOString();
    const record: JobRecord = {
      id: spec.id,
      spec,
      state: "pending",
      reason: null,
      model: null,
      approved: false,
      retries: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
      attempts: 0,
      steps: 0,
      loaded_skills: [],
      created_at: now,
      updated_at: now,
    };
    try {
      // `wx` fails if the file exists — matches Postgres's primary-key rejection.
      await writeFile(this.jobPath(spec.id), `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
    } catch (err) {
      if ((err as { code?: string }).code === "EEXIST") {
        throw new Error(`job already exists: ${spec.id}`);
      }
      throw err;
    }
    return record;
  }

  async get(id: string): Promise<JobRecord | undefined> {
    try {
      return JSON.parse(await readFile(this.jobPath(id), "utf8")) as JobRecord;
    } catch {
      return undefined;
    }
  }

  async list(): Promise<JobRecord[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch (err) {
      // A missing store dir just means no jobs yet; surface anything else.
      if ((err as { code?: string }).code === "ENOENT") return [];
      throw err;
    }
    const ids = files
      .filter(
        (f) => f.endsWith(".json") && !f.endsWith(".checkpoint.json") && !f.endsWith(".trace.json"),
      )
      .map((f) => f.slice(0, -".json".length));
    const records = await Promise.all(ids.map((id) => this.get(id)));
    return records.filter((r): r is JobRecord => r !== undefined);
  }

  async listByFactio(factio: string): Promise<JobRecord[]> {
    return (await this.list()).filter((r) => r.spec.factio === factio);
  }

  async update(id: string, patch: JobPatch): Promise<void> {
    const record = await this.get(id);
    if (!record) throw new Error(`job not found: ${id}`);
    Object.assign(record, patch, { updated_at: new Date().toISOString() });
    await writeFile(this.jobPath(id), `${JSON.stringify(record, null, 2)}\n`);
  }

  async saveCheckpoint(checkpoint: WorkerCheckpoint): Promise<void> {
    if (!(await this.get(checkpoint.job_id))) {
      throw new Error(`job not found: ${checkpoint.job_id}`);
    }
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.checkpointPath(checkpoint.job_id), JSON.stringify(checkpoint));
  }

  async loadCheckpoint(jobId: string): Promise<WorkerCheckpoint | undefined> {
    try {
      return JSON.parse(await readFile(this.checkpointPath(jobId), "utf8")) as WorkerCheckpoint;
    } catch {
      return undefined;
    }
  }

  async saveTrace(trace: Trace): Promise<void> {
    if (!(await this.get(trace.job_id))) throw new Error(`job not found: ${trace.job_id}`);
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.tracePath(trace.job_id), JSON.stringify(trace));
  }

  async loadTrace(jobId: string): Promise<Trace | undefined> {
    try {
      return JSON.parse(await readFile(this.tracePath(jobId), "utf8")) as Trace;
    } catch {
      return undefined;
    }
  }
}
