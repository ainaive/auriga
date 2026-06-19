-- Phase 6 (web-first): durable live-run event log for the Postgres EventBus.
-- Backfill source for the SSE endpoint; paired with LISTEN/NOTIFY for cross-process
-- fan-out. `seq` is a bigserial (globally monotonic), so concurrent publishes never
-- race on the per-job cursor. Mirrors JOB_EVENTS_SCHEMA_SQL in habenae/src/event-bus.ts.
create table if not exists job_events (
  seq    bigserial primary key,
  job_id text not null,
  ts     timestamptz not null default now(),
  factio text not null,
  data   jsonb not null
);
create index if not exists job_events_job_seq_idx on job_events (job_id, seq);
