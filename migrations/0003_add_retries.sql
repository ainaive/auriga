-- Phase 3: control-plane retry counter + a tenant index for scheduler/list hot paths.
alter table jobs add column if not exists retries integer not null default 0 check (retries >= 0);
create index if not exists jobs_factio_idx on jobs ((spec ->> 'factio'));
