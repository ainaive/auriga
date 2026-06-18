-- Phase 3: control-plane retry counter.
alter table jobs add column if not exists retries integer not null default 0;
