import type { Sandbox } from "@auriga/sandbox";
import type { Tool } from "../tool";
import { formatExec } from "./util";

export function makeBashTool(sandbox: Sandbox): Tool {
  return {
    name: "bash",
    description: "Run a shell command in the workspace; returns exit code, stdout, and stderr.",
    input_schema: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "The shell command to run." },
        cwd: { type: "string", description: "Working dir relative to the workspace root." },
        timeoutMs: { type: "number", description: "Kill the command after this many ms." },
      },
      required: ["cmd"],
    },
    async run(input) {
      const cmd = typeof input.cmd === "string" ? input.cmd : "";
      if (!cmd) throw new Error("cmd is required");
      const result = await sandbox.exec(cmd, {
        ...(typeof input.cwd === "string" ? { cwd: input.cwd } : {}),
        ...(typeof input.timeoutMs === "number" ? { timeoutMs: input.timeoutMs } : {}),
      });
      return formatExec(result);
    },
  };
}
