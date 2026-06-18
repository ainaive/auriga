import { Pool } from "pg";
import type { JobSpec } from "@auriga/core";
import type { JobPatch, JobRecord, JobStore, WorkerCheckpoint } from "./types";

/** Schema for the Postgres-backed store (also mirrored in migrations/0001_init.sql). */
export const SCHEMA_SQL = `
create table if not exists jobs (
  id            text primary key,
  spec          jsonb not null,
  state         text not null,
  reason        text,
  model         text,
  usage         jsonb not null default '{"input_tokens":0,"output_tokens":0}'::jsonb,
  attempts      integer not null default 0,
  steps         integer not null default 0,
  loaded_skills jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create table if not exists checkpoints (
  job_id     text primary key references jobs(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
`;

export async function migrate(pool: Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}

const UPDATABLE = new Set([
  "state",
  "reason",
  "model",
  "usage",
  "attempts",
  "steps",
  "loaded_skills",
]);

/**
 * Durable JobStore backed by Postgres. Verified against a live database (docker
 * compose up). The in-memory store mirrors this contract for local tests.
 */
export class PostgresJobStore implements JobStore {
  constructor(private readonly pool: Pool) {}

  async create(spec: JobSpec): Promise<JobRecord> {
    const res = await this.pool.query(
      `insert into jobs (id, spec, state) values ($1, $2, 'pending') returning *`,
      [spec.id, JSON.stringify(spec)],
    );
    return rowToRecord(res.rows[0]);
  }

  async get(id: string): Promise<JobRecord | undefined> {
    const res = await this.pool.query(`select * from jobs where id = $1`, [id]);
    return res.rows[0] ? rowToRecord(res.rows[0]) : undefined;
  }

  async list(): Promise<JobRecord[]> {
    const res = await this.pool.query(`select * from jobs order by created_at desc`);
    return res.rows.map(rowToRecord);
  }

  async update(id: string, patch: JobPatch): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const [key, value] of Object.entries(patch)) {
      if (!UPDATABLE.has(key)) continue;
      const isJson = key === "usage" || key === "loaded_skills";
      sets.push(`${key} = $${i++}`);
      values.push(isJson ? JSON.stringify(value) : value);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = now()");
    values.push(id);
    await this.pool.query(`update jobs set ${sets.join(", ")} where id = $${i}`, values);
  }

  async saveCheckpoint(checkpoint: WorkerCheckpoint): Promise<void> {
    await this.pool.query(
      `insert into checkpoints (job_id, data) values ($1, $2)
       on conflict (job_id) do update set data = excluded.data, updated_at = now()`,
      [checkpoint.job_id, JSON.stringify(checkpoint)],
    );
  }

  async loadCheckpoint(jobId: string): Promise<WorkerCheckpoint | undefined> {
    const res = await this.pool.query(`select data from checkpoints where job_id = $1`, [jobId]);
    return res.rows[0] ? (res.rows[0].data as WorkerCheckpoint) : undefined;
  }
}

interface JobRow {
  id: string;
  spec: JobSpec;
  state: string;
  reason: string | null;
  model: string | null;
  usage: JobRecord["usage"];
  attempts: number;
  steps: number;
  loaded_skills: JobRecord["loaded_skills"];
  created_at: Date;
  updated_at: Date;
}

function rowToRecord(row: JobRow): JobRecord {
  return {
    id: row.id,
    spec: row.spec,
    state: row.state as JobRecord["state"],
    reason: row.reason,
    model: row.model,
    usage: row.usage,
    attempts: row.attempts,
    steps: row.steps,
    loaded_skills: row.loaded_skills,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}
