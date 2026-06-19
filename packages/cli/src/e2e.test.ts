import { test, expect } from "bun:test";
import { fileURLToPath } from "node:url";
import { textResponse, toolUseResponse, type JobSpec } from "@auriga/core";
import { StubProvider } from "@auriga/provider";
import { LocalSandboxDriver } from "@auriga/sandbox";
import { InMemoryJobStore, Worker } from "@auriga/habenae";

const FIXTURE = fileURLToPath(new URL("../../../fixtures/failing-test", import.meta.url));

const FIXED_ADD = `export function add(a: number, b: number): number {
  return a + b;
}
`;

/**
 * Full-stack e2e: store → worker → sandbox (seeded from the failing-test fixture)
 * → Plan-Execute-Verify → tools → verification gate runs the real \`bun test\`.
 * The model is a deterministic stub that applies the fix; the gate decides "done".
 */
test("e2e: agent fixes a failing test and the verification gate passes", async () => {
  const store = new InMemoryJobStore();
  const spec: JobSpec = {
    id: "job_e2e",
    factio: "default",
    created_by: "test",
    goal: "Make the failing test pass by fixing the bug in src/add.ts.",
    context_refs: { workspace: { kind: "dir", url_or_path: FIXTURE } },
    allowed_tools: ["read_file", "write_file", "bash"],
    acceptance_criteria: [{ kind: "command", cmd: "bun test", expect_exit: 0 }],
    budget: { max_tokens: 100_000, max_wall_time_s: 120, max_cost_usd: 1, max_steps: 20 },
  };
  await store.create(spec);

  const provider = new StubProvider([
    toolUseResponse("write_file", { path: "src/add.ts", content: FIXED_ADD }),
    textResponse("Fixed add() to return a + b."),
  ]);

  const result = await new Worker({
    store,
    provider,
    model: "stub",
    sandboxDriver: new LocalSandboxDriver(),
  }).run("job_e2e");

  expect(result.state).toBe("done");
  expect(result.verification?.passed).toBe(true);
  expect((await store.get("job_e2e"))?.state).toBe("done");
}, 30_000);

test("e2e: the gate keeps a job from completing when the bug is not fixed", async () => {
  const store = new InMemoryJobStore();
  const spec: JobSpec = {
    id: "job_e2e_fail",
    factio: "default",
    created_by: "test",
    goal: "Make the failing test pass.",
    context_refs: { workspace: { kind: "dir", url_or_path: FIXTURE } },
    allowed_tools: ["read_file", "write_file", "bash"],
    acceptance_criteria: [{ kind: "command", cmd: "bun test", expect_exit: 0 }],
    budget: { max_tokens: 100_000, max_wall_time_s: 120, max_cost_usd: 1, max_steps: 20 },
  };
  await store.create(spec);

  // The "agent" does nothing useful — the gate must reject completion.
  const provider = new StubProvider([
    textResponse("I think it's fine."),
    textResponse("Still fine."),
  ]);

  const result = await new Worker({
    store,
    provider,
    model: "stub",
    sandboxDriver: new LocalSandboxDriver(),
    maxAttempts: 2,
  }).run("job_e2e_fail");

  expect(result.state).toBe("failed");
  expect(result.verification?.passed).toBe(false);
}, 30_000);
