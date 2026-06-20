import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";
import { newId } from "@auriga/core";

/** An immutable governance/audit record. */
export interface AuditEvent {
  id: string;
  ts: string;
  factio: string;
  actor: string | null;
  /** e.g. job.created, job.completed, job.failed, job.paused, job.approved, policy.denied */
  action: string;
  job_id: string | null;
  detail?: string;
}

export type NewAuditEvent = Omit<AuditEvent, "id" | "ts">;

/** Append-only audit trail (no update/delete). */
export interface AuditLog {
  record(event: NewAuditEvent): Promise<AuditEvent>;
  /** Most recent first. */
  list(limit?: number): Promise<AuditEvent[]>;
  listByFactio(factio: string, limit?: number): Promise<AuditEvent[]>;
}

function stamp(event: NewAuditEvent): AuditEvent {
  return { id: newId("aud"), ts: new Date().toISOString(), ...event };
}

function cap<T>(items: T[], limit?: number): T[] {
  return limit === undefined ? items : items.slice(0, Math.max(0, limit));
}

/** Best-effort audit: record an event without ever failing the caller's operation. */
export async function safeAudit(audit: AuditLog | undefined, event: NewAuditEvent): Promise<void> {
  if (!audit) return;
  try {
    await audit.record(event);
  } catch (err) {
    console.warn(
      `[auriga] audit write failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export class InMemoryAuditLog implements AuditLog {
  private readonly events: AuditEvent[] = [];

  async record(event: NewAuditEvent): Promise<AuditEvent> {
    const full = stamp(event);
    this.events.push(full);
    return structuredClone(full);
  }

  async list(limit?: number): Promise<AuditEvent[]> {
    return cap([...this.events].reverse(), limit).map((e) => structuredClone(e));
  }

  async listByFactio(factio: string, limit?: number): Promise<AuditEvent[]> {
    const recent = [...this.events].reverse().filter((e) => e.factio === factio);
    return cap(recent, limit).map((e) => structuredClone(e));
  }
}

/** Append-only JSON-lines file (audit.jsonl) for local single-machine use. */
export class FileAuditLog implements AuditLog {
  constructor(private readonly dir: string) {}

  private get path(): string {
    return join(this.dir, "audit.jsonl");
  }

  async record(event: NewAuditEvent): Promise<AuditEvent> {
    const full = stamp(event);
    await mkdir(this.dir, { recursive: true });
    await appendFile(this.path, `${JSON.stringify(full)}\n`);
    return full;
  }

  private async readAll(): Promise<AuditEvent[]> {
    let text: string;
    try {
      text = await readFile(this.path, "utf8");
    } catch (err) {
      if ((err as { code?: string }).code === "ENOENT") return [];
      throw err;
    }
    return text
      .split("\n")
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as AuditEvent);
  }

  async list(limit?: number): Promise<AuditEvent[]> {
    return cap((await this.readAll()).reverse(), limit);
  }

  async listByFactio(factio: string, limit?: number): Promise<AuditEvent[]> {
    const recent = (await this.readAll()).reverse().filter((e) => e.factio === factio);
    return cap(recent, limit);
  }
}

export const AUDIT_SCHEMA_SQL = `
create table if not exists audit_events (
  id      text primary key,
  seq     bigserial not null,
  ts      timestamptz not null default now(),
  factio  text not null,
  actor   text,
  action  text not null,
  job_id  text,
  detail  text
);
-- Monotonic insertion order. \`ts\` is millisecond-precision, so same-millisecond
-- events tie under \`order by ts\` and "recent-first" becomes non-deterministic;
-- \`seq\` (a bigserial) gives a stable ordering. Additive for databases created
-- before the column existed — ADD COLUMN backfills via a table rewrite, which is DDL
-- and does not trip the append-only UPDATE trigger.
alter table audit_events add column if not exists seq bigserial;
create index if not exists audit_seq_idx on audit_events (seq desc);
create index if not exists audit_factio_seq_idx on audit_events (factio, seq desc);

-- Enforce append-only at the database layer: reject UPDATE/DELETE.
create or replace function prevent_audit_events_mutation() returns trigger
language plpgsql as $$ begin raise exception 'audit_events is append-only'; end; $$;
drop trigger if exists audit_events_no_update on audit_events;
create trigger audit_events_no_update before update on audit_events
  for each row execute function prevent_audit_events_mutation();
drop trigger if exists audit_events_no_delete on audit_events;
create trigger audit_events_no_delete before delete on audit_events
  for each row execute function prevent_audit_events_mutation();
`;

/** Append-only Postgres audit log. Verified against a live database. */
export class PostgresAuditLog implements AuditLog {
  constructor(private readonly pool: Pool) {}

  static async migrate(pool: Pool): Promise<void> {
    await pool.query(AUDIT_SCHEMA_SQL);
  }

  async record(event: NewAuditEvent): Promise<AuditEvent> {
    const full = stamp(event);
    await this.pool.query(
      `insert into audit_events (id, ts, factio, actor, action, job_id, detail)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [full.id, full.ts, full.factio, full.actor, full.action, full.job_id, full.detail ?? null],
    );
    return full;
  }

  async list(limit?: number): Promise<AuditEvent[]> {
    const res =
      limit === undefined
        ? await this.pool.query(`select * from audit_events order by seq desc`)
        : await this.pool.query(`select * from audit_events order by seq desc limit $1`, [limit]);
    return res.rows.map(rowToEvent);
  }

  async listByFactio(factio: string, limit?: number): Promise<AuditEvent[]> {
    const res =
      limit === undefined
        ? await this.pool.query(`select * from audit_events where factio = $1 order by seq desc`, [
            factio,
          ])
        : await this.pool.query(
            `select * from audit_events where factio = $1 order by seq desc limit $2`,
            [factio, limit],
          );
    return res.rows.map(rowToEvent);
  }
}

function rowToEvent(row: {
  id: string;
  ts: Date;
  factio: string;
  actor: string | null;
  action: string;
  job_id: string | null;
  detail: string | null;
}): AuditEvent {
  return {
    id: row.id,
    ts: row.ts.toISOString(),
    factio: row.factio,
    actor: row.actor,
    action: row.action,
    job_id: row.job_id,
    ...(row.detail !== null ? { detail: row.detail } : {}),
  };
}
