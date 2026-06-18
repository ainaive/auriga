import type { Sandbox } from "@auriga/sandbox";
import type { Tool } from "../tool";

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
}

export function makeReadFileTool(sandbox: Sandbox): Tool {
  return {
    name: "read_file",
    description: "Read a UTF-8 file from the workspace.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Workspace-relative path." } },
      required: ["path"],
    },
    async run(input) {
      return sandbox.readFile(requireString(input, "path"));
    },
  };
}

export function makeWriteFileTool(sandbox: Sandbox): Tool {
  return {
    name: "write_file",
    description: "Write (create or overwrite) a UTF-8 file in the workspace.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative path." },
        content: { type: "string", description: "Full file contents." },
      },
      required: ["path", "content"],
    },
    async run(input) {
      const path = requireString(input, "path");
      const content = typeof input.content === "string" ? input.content : "";
      await sandbox.writeFile(path, content);
      return `wrote ${path} (${content.length} bytes)`;
    },
  };
}

export function makeListDirTool(sandbox: Sandbox): Tool {
  return {
    name: "list_dir",
    description: "List entries in a workspace directory.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", description: "Directory (default: workspace root)." } },
    },
    async run(input) {
      const dir = typeof input.path === "string" && input.path.length > 0 ? input.path : ".";
      const entries = await sandbox.list(dir);
      return entries.length ? entries.join("\n") : "(empty)";
    },
  };
}
