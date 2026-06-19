import { test, expect } from "bun:test";
import { textResponse, toolUseResponse, userText, type JobSpec } from "@auriga/core";
import { StubProvider } from "@auriga/provider";
import { LocalSandboxDriver, type Sandbox } from "@auriga/sandbox";
import { runLoop } from "./loop";
import { runJob } from "./job-runner";

test("runLoop uses the plan model for step 1 and the act model afterwards", async () => {
  const provider = new StubProvider([toolUseResponse("noop", {}), textResponse("done")]);
  await runLoop({
    provider,
    model: "fast",
    planModel: "strong",
    messages: [userText("go")],
    maxSteps: 5,
  });
  expect(provider.calls[0]?.model).toBe("strong"); // plan
  expect(provider.calls[1]?.model).toBe("fast"); // act
});

async function emptySandbox(): Promise<Sandbox> {
  return new LocalSandboxDriver().create({ workspace: { kind: "empty" } });
}

test("runJob applies planModel to the planning step of each attempt", async () => {
  const sandbox = await emptySandbox();
  const provider = new StubProvider([
    toolUseResponse("write_file", { path: "answer.txt", content: "x" }),
    textResponse("done"),
  ]);
  const spec: JobSpec = {
    id: "job_route",
    factio: "default",
    created_by: "t",
    goal: "g",
    context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
    allowed_tools: ["write_file"],
    acceptance_criteria: [{ kind: "file_exists", path: "answer.txt" }],
    budget: { max_tokens: 100_000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 20 },
  };
  try {
    const result = await runJob({ spec, provider, model: "fast", planModel: "strong", sandbox });
    expect(result.state).toBe("done");
    expect(provider.calls[0]?.model).toBe("strong");
    expect(provider.calls[1]?.model).toBe("fast");
  } finally {
    await sandbox.destroy();
  }
});
