import type { Trace } from "@auriga/core";
import { formatUsage } from "./cost";
import { traceCost } from "./rollup";

/** Render a trace as human-readable lines for the CLI/console, with a cost footer. */
export function formatTrace(t: Trace): string {
  const lines = [`job ${t.job_id} · model ${t.model} · ${t.result.state} (${t.result.reason})`];
  for (const e of t.events) {
    switch (e.type) {
      case "model_response":
        lines.push(
          `  · model → ${e.response.stop_reason} (in ${e.response.usage.input_tokens} / out ${e.response.usage.output_tokens})`,
        );
        break;
      case "tool_call":
        lines.push(`  · tool ${e.tool}${e.isError ? " [error]" : ""}`);
        break;
      case "skill_loaded":
        lines.push(`  · skill ${e.skill.name}@${e.skill.version}`);
        break;
      case "compaction":
        lines.push(`  · compaction: dropped ${e.dropped} (${e.before}→${e.after} tok)`);
        break;
      case "verify":
        lines.push(`  · verify attempt ${e.attempt}: ${e.passed ? "PASS" : "fail"}`);
        break;
    }
  }
  const cost = traceCost(t);
  lines.push(`cost: ${formatUsage(t.model, cost.usage)} · ${cost.model_calls} model calls`);
  return lines.join("\n");
}
