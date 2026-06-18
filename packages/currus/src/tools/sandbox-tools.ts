import type { Sandbox } from "@auriga/sandbox";
import type { Tool } from "../tool";
import { makeBashTool } from "./bash";
import { makeListDirTool, makeReadFileTool, makeWriteFileTool } from "./file";
import { makeGitTool } from "./git";
import { makeSearchTool } from "./search";

/** The standard tool set bound to a sandbox: read/write/list, bash, git, search. */
export function makeSandboxTools(sandbox: Sandbox): Tool[] {
  return [
    makeReadFileTool(sandbox),
    makeWriteFileTool(sandbox),
    makeListDirTool(sandbox),
    makeBashTool(sandbox),
    makeGitTool(sandbox),
    makeSearchTool(sandbox),
  ];
}
