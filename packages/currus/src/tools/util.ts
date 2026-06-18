import type { ExecResult } from "@auriga/sandbox";

const MAX_OUTPUT = 20_000;

/** Truncate large tool output to protect the context window. */
export function truncate(s: string, max = MAX_OUTPUT): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]`;
}

/** Single-quote a string for safe interpolation into a `sh -c` command. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Render an exec result for the model: exit code + (truncated) stdout/stderr. */
export function formatExec(r: ExecResult): string {
  const parts = [`exit: ${r.exitCode}${r.timedOut ? " (timed out)" : ""}`];
  if (r.stdout.trim()) parts.push(`stdout:\n${truncate(r.stdout)}`);
  if (r.stderr.trim()) parts.push(`stderr:\n${truncate(r.stderr)}`);
  return parts.join("\n");
}
