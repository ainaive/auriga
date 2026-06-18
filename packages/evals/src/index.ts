/**
 * @auriga/evals — deterministic replay + an eval runner. Replays recorded job
 * traces through the real harness (no model calls) and scores them, so harness
 * changes can be regression-tested against past runs.
 */
export { ReplayProvider } from "./replay";
export {
  runEval,
  runEvals,
  summarize,
  type EvalCase,
  type EvalScore,
  type EvalSummary,
  type RunEvalOptions,
} from "./runner";
export { loadEvalCases } from "./load";
