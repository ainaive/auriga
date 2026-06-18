import type { JobSpec, JobState, SkillRegistry, Trace, Usage, VerificationKey } from "@auriga/core";
import { traceCost } from "@auriga/capella";
import { runJob } from "@auriga/currus";
import type { SandboxDriver, WorkspaceSeed } from "@auriga/sandbox";
import { ReplayProvider } from "./replay";

/** A recorded run to replay-and-score: the job spec + its trace. */
export interface EvalCase {
  spec: JobSpec;
  trace: Trace;
}

export interface EvalScore {
  job_id: string;
  recorded_state: JobState;
  replay_state: JobState | "error";
  /** Replay reproduced the recorded final state. */
  matches: boolean;
  verify_passed: boolean;
  steps: number;
  usage: Usage;
  cost_usd: number;
  error?: string;
}

export interface EvalSummary {
  total: number;
  matched: number;
  done: number;
  verify_passed: number;
  total_cost_usd: number;
}

export interface RunEvalOptions {
  registry?: SkillRegistry;
  trustedKeys?: VerificationKey[];
}

function seedFor(spec: JobSpec): WorkspaceSeed {
  const ws = spec.context_refs.workspace;
  return ws.kind === "dir" ? { kind: "dir", path: ws.url_or_path } : { kind: "empty" };
}

/** Replay one case through the harness against a fresh sandbox, and score it. */
export async function runEval(
  evalCase: EvalCase,
  driver: SandboxDriver,
  opts: RunEvalOptions = {},
): Promise<EvalScore> {
  const { spec, trace } = evalCase;
  const sandbox = await driver.create({ workspace: seedFor(spec) });
  const cost = traceCost(trace).cost_usd;
  try {
    const result = await runJob({
      spec,
      provider: new ReplayProvider(trace),
      model: trace.model,
      sandbox,
      ...(opts.registry ? { registry: opts.registry } : {}),
      ...(opts.trustedKeys ? { trustedKeys: opts.trustedKeys } : {}),
    });
    return {
      job_id: spec.id,
      recorded_state: trace.result.state,
      replay_state: result.state,
      matches: result.state === trace.result.state,
      verify_passed: result.verification?.passed ?? false,
      steps: result.steps,
      usage: result.usage,
      cost_usd: cost,
    };
  } catch (err) {
    return {
      job_id: spec.id,
      recorded_state: trace.result.state,
      replay_state: "error",
      matches: false,
      verify_passed: false,
      steps: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
      cost_usd: cost,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await sandbox.destroy();
  }
}

export function summarize(scores: readonly EvalScore[]): EvalSummary {
  return {
    total: scores.length,
    matched: scores.filter((s) => s.matches).length,
    done: scores.filter((s) => s.replay_state === "done").length,
    verify_passed: scores.filter((s) => s.verify_passed).length,
    total_cost_usd: scores.reduce((a, s) => a + (Number.isFinite(s.cost_usd) ? s.cost_usd : 0), 0),
  };
}

/** Replay + score a batch of cases. */
export async function runEvals(
  cases: readonly EvalCase[],
  driver: SandboxDriver,
  opts: RunEvalOptions = {},
): Promise<{ scores: EvalScore[]; summary: EvalSummary }> {
  const scores: EvalScore[] = [];
  for (const evalCase of cases) {
    scores.push(await runEval(evalCase, driver, opts));
  }
  return { scores, summary: summarize(scores) };
}
