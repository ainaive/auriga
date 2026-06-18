/**
 * @auriga/currus — the harness runtime ("the chariot"): the agent loop that runs
 * inside the sandbox. Phase 0 ships the minimal model→tool→model loop; Phase 1
 * expands it into Plan-Execute-Verify with context engineering and verification.
 */
export { runLoop, type RunLoopOptions, type LoopResult } from "./loop";
export type { Tool } from "./tool";
export { echoTool } from "./tools/echo";
