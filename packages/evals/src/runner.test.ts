import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import { textResponse, toolUseResponse, type JobSpec, type Trace } from "@auriga/core";
import { Recorder } from "@auriga/capella";
import { runJob } from "@auriga/currus";
import { StubProvider } from "@auriga/provider";
import { LocalSandboxDriver } from "@auriga/sandbox";
import { runEval, runEvals } from "./runner";

const FIXTURE = fileURLToPath(new URL("../../../fixtures/failing-test", import.meta.url));
const FIXED_ADD = `export function add(a: number, b: number): number {\n  return a + b;\n}\n`;

function spec(id: string): JobSpec {
  return {
    id,
    factio: "default",
    created_by: "test",
    goal: "Fix the bug in src/add.ts so the test passes.",
    context_refs: { workspace: { kind: "dir", url_or_path: FIXTURE } },
    allowed_tools: ["read_file", "write_file", "bash"],
    acceptance_criteria: [{ kind: "command", cmd: "bun test", expect_exit: 0 }],
    budget: { max_tokens: 100_000, max_wall_time_s: 120, max_cost_usd: 1, max_steps: 20 },
  };
}

/** Record a trace by running the fixture job once with a scripted stub. */
async function recordTrace(id: string): Promise<Trace> {
  const sandbox = await new LocalSandboxDriver().create({ workspace: { kind: "dir", path: FIXTURE } });
  const recorder = new Recorder(id, "stub");
  try {
    const result = await runJob({
      spec: spec(id),
      provider: new StubProvider([
        toolUseResponse("write_file", { path: "src/add.ts", content: FIXED_ADD }),
        textResponse("fixed"),
      ]),
      model: "stub",
      sandbox,
      onTrace: recorder.record,
    });
    return recorder.finish({
      state: result.state,
      reason: result.reason,
      attempts: result.attempts,
      steps: result.steps,
      usage: result.usage,
      loaded_skills: result.loadedSkills,
    });
  } finally {
    await sandbox.destroy();
  }
}

test(
  "replay reproduces the recorded outcome deterministically",
  async () => {
    const trace = await recordTrace("job_eval");
    expect(trace.result.state).toBe("done");

    const score = await runEval({ spec: spec("job_eval"), trace }, new LocalSandboxDriver());
    expect(score.replay_state).toBe("done");
    expect(score.matches).toBe(true);
    expect(score.verify_passed).toBe(true);
  },
  30_000,
);

test(
  "batch summary aggregates replay scores",
  async () => {
    const trace = await recordTrace("job_batch");
    const { summary } = await runEvals(
      [
        { spec: spec("a"), trace },
        { spec: spec("b"), trace },
      ],
      new LocalSandboxDriver(),
    );
    expect(summary.total).toBe(2);
    expect(summary.matched).toBe(2);
    expect(summary.done).toBe(2);
  },
  30_000,
);

test("replay flags divergence when the trace lacks enough responses", async () => {
  // One tool response but no closing text → the loop will ask for another
  // response that the trace doesn't have → ReplayProvider throws.
  const trace: Trace = {
    job_id: "job_diverge",
    model: "stub",
    events: [
      { type: "model_response", step: 1, response: toolUseResponse("write_file", { path: "x.txt", content: "x" }) },
    ],
    result: {
      state: "done",
      reason: "ok",
      attempts: 1,
      steps: 1,
      usage: { input_tokens: 0, output_tokens: 0 },
      loaded_skills: [],
    },
  };
  // The loop dispatches the one tool call, then asks for another response that
  // the trace doesn't have → ReplayProvider throws → flagged as a divergence.
  const score = await runEval({ spec: spec("job_diverge"), trace }, new LocalSandboxDriver());
  expect(score.replay_state).toBe("error");
  expect(score.matches).toBe(false);
  expect(score.error).toContain("exhausted");
});

test("loadEvalCases is exported from the public barrel", async () => {
  const { loadEvalCases } = await import("./index");
  expect(typeof loadEvalCases).toBe("function");
});
