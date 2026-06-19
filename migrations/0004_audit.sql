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

-- Enforce append-only at the database layer: reject UPDATE/DELETE on audit rows.
create or replace function prevent_audit_events_mutation() returns trigger
language plpgsql as $$ begin raise exception 'audit_events is append-only'; end; $$;
drop trigger if exists audit_events_no_update on audit_events;
create trigger audit_events_no_update before update on audit_events
  for each row execute function prevent_audit_events_mutation();
drop trigger if exists audit_events_no_delete on audit_events;
create trigger audit_events_no_delete before delete on audit_events
  for each row execute function prevent_audit_events_mutation();
