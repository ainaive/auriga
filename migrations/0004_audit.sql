-- Phase 4: append-only governance audit log.
create table if not exists audit_events (
  id      text primary key,
  ts      timestamptz not null default now(),
  factio  text not null,
  actor   text,
  action  text not null,
  job_id  text,
  detail  text
);
create index if not exists audit_factio_idx on audit_events (factio, ts desc);
