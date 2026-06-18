/**
 * Identifier helpers. Prefixed, URL-safe, sortable-enough ids for domain objects.
 *
 * Format: `<prefix>_<24 hex chars>` derived from a UUIDv4. The prefix makes ids
 * self-describing in logs and traces.
 */

export function newId(prefix: string): string {
  const hex = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}_${hex.slice(0, 24)}`;
}

export const ids = {
  job: () => newId("job"),
  step: () => newId("step"),
  trace: () => newId("trace"),
  run: () => newId("run"),
} as const;
