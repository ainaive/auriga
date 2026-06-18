import type { Sandbox } from "@auriga/sandbox";
import type { Tool } from "../tool";
import { formatExec } from "./util";

export function makeGitTool(sandbox: Sandbox): Tool {
  return {
    name: "git",
    description: "Run a git command in the workspace, e.g. args='status' or args='diff HEAD'.",
    input_schema: {
      type: "object",
      properties: { args: { type: "string", description: "Arguments after `git`." } },
      required: ["args"],
    },
    async run(input) {
      const args = typeof input.args === "string" ? input.args : "";
      const result = await sandbox.exec(`git ${args}`);
      return formatExec(result);
    },
  };
}
