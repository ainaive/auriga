import type { Sandbox } from "@auriga/sandbox";
import type { Tool } from "../tool";
import { shellQuote, truncate } from "./util";

export function makeSearchTool(sandbox: Sandbox): Tool {
  return {
    name: "search",
    description: "Search workspace files for a regex pattern (recursive grep).",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Regex to search for." },
        path: { type: "string", description: "File or directory to search (default: workspace root)." },
      },
      required: ["pattern"],
    },
    async run(input) {
      const pattern = typeof input.pattern === "string" ? input.pattern : "";
      if (!pattern) throw new Error("pattern is required");
      const path = typeof input.path === "string" && input.path.length > 0 ? input.path : ".";
      const result = await sandbox.exec(
        `grep -rnI -e ${shellQuote(pattern)} -- ${shellQuote(path)}`,
      );
      // grep exit 1 = no matches (not an error)
      if (result.exitCode === 1 && !result.stderr.trim()) return "no matches";
      if (result.exitCode > 1) return `search error: ${result.stderr.trim() || `exit ${result.exitCode}`}`;
      return truncate(result.stdout) || "no matches";
    },
  };
}
