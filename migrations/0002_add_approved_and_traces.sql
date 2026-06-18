-- Phase 2: HITL approval flag + trace persistence.
-- Additive over 0001 so existing Phase-1 databases upgrade cleanly.

alter table jobs add column if not exists approved boolean not null default false;

create table if not exists traces (
  job_id     text primary key references jobs(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
