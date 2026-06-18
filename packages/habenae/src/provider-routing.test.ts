import { test, expect } from "bun:test";
import { textResponse, toolUseResponse, type JobSpec } from "@auriga/core";
import { costAwareRouter, StubProvider } from "@auriga/provider";
import { LocalSandboxDriver } from "@auriga/sandbox";
import { InMemoryJobStore } from "./memory-store";
import { Worker } from "./worker";

function spec(id: string, maxCostUsd: number): JobSpec {
  return {
    id,
    factio: "default",
    created_by: "u",
    goal: "g",
    context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
    allowed_tools: ["write_file"],
    acceptance_criteria: [{ kind: "file_exists", path: "answer.txt" }],
    budget: { max_tokens: 100_000, max_wall_time_s: 60, max_cost_usd: maxCostUsd, max_steps: 20 },
  };
}

test("the worker runs a low-budget job on the cheap backend", async () => {
  const store = new InMemoryJobStore();
  await store.create(spec("job_cheap", 0.5));

  const cheap = new StubProvider([
    toolUseResponse("write_file", { path: "answer.txt", content: "x" }),
    textResponse("done"),
  ]);
  const strong = new StubProvider([textResponse("should-not-run")]);

  await new Worker({
    store,
    provider: strong, // fallback, should be unused
    model: "fallback",
    sandboxDriver: new LocalSandboxDriver(),
    providerRouter: costAwareRouter({
      default: { provider: strong, plan: "opus", act: "sonnet" },
      cheap: { provider: cheap, model: "haiku" },
      cheapBelowUsd: 1,
    }),
  }).run("job_cheap");

  expect(cheap.calls.length).toBeGreaterThan(0);
  expect(strong.calls.length).toBe(0);
  expect(cheap.calls[0]?.model).toBe("haiku");
  expect((await store.get("job_cheap"))?.state).toBe("done");
});
