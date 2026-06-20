-- Deterministic recent-first ordering for the audit log. `ts` is millisecond-
-- precision, so same-millisecond events tie under `order by ts` and "recent-first"
-- becomes non-deterministic. Add a monotonic `seq` (bigserial) and order by it.
-- ADD COLUMN backfills existing rows via a table rewrite — DDL, so it does not trip
-- the append-only UPDATE trigger. Mirrors AUDIT_SCHEMA_SQL in habenae/src/audit.ts.
alter table audit_events add column if not exists seq bigserial;
create index if not exists audit_seq_idx on audit_events (seq desc);
create index if not exists audit_factio_seq_idx on audit_events (factio, seq desc);
