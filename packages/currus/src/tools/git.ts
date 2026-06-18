import type { Sandbox } from "@auriga/sandbox";
import type { Tool } from "../tool";
import { formatExec, shellQuote } from "./util";

export function makeGitTool(sandbox: Sandbox): Tool {
  return {
    name: "git",
    description: "Run a git command in the workspace, with tokenized args, e.g. ['status'] or ['diff','HEAD'].",
    input_schema: {
      type: "object",
      properties: {
        args: {
          type: "array",
          items: { type: "string" },
          description: "Arguments after `git`, tokenized (each element is one argument).",
        },
      },
      required: ["args"],
    },
    async run(input) {
      // Tokenized + shell-quoted so `allowed_tools: ['git']` cannot run arbitrary
      // shell payloads via metacharacters in a raw string.
      const args = input.args;
      if (!Array.isArray(args) || args.length === 0 || args.some((a) => typeof a !== "string")) {
        throw new Error("args must be a non-empty string[]");
      }
      const cmd = `git ${(args as string[]).map(shellQuote).join(" ")}`;
      return formatExec(await sandbox.exec(cmd));
    },
  };
}
