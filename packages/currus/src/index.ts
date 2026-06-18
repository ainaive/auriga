/**
 * @auriga/currus — the harness runtime ("the chariot"): the agent loop that runs
 * inside the sandbox. Phase 0 shipped the minimal model→tool→model loop; Phase 1
 * adds sandbox-backed tools, an allowlist dispatcher, and (next) Plan-Execute-Verify.
 */
export { runLoop, type RunLoopOptions, type LoopResult } from "./loop";
export { ToolDispatcher, type ToolDispatchResult } from "./dispatcher";
export {
  VerificationGate,
  type VerificationResult,
  type CriterionResult,
  type NamedCheck,
} from "./verification";
export {
  SkillResolver,
  makeSelectSkillTool,
  type SkillResolverOptions,
  type MountedSkill,
} from "./skills";
export {
  estimateTokens,
  messageTokens,
  compactMessages,
  type CompactionOptions,
  type CompactionResult,
} from "./context";
export { WorkspaceMemory, makeMemoryTools } from "./memory";
export type { Tool } from "./tool";
export { echoTool } from "./tools/echo";
export { makeSandboxTools } from "./tools/sandbox-tools";
export { makeBashTool } from "./tools/bash";
export { makeReadFileTool, makeWriteFileTool, makeListDirTool } from "./tools/file";
export { makeGitTool } from "./tools/git";
export { makeSearchTool } from "./tools/search";
