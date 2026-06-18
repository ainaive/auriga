-- Auriga control-plane schema (Habenae). Applied by @auriga/habenae migrate().
-- graphile-worker manages its own tables via its migrate().

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
