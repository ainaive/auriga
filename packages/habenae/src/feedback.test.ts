import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { textResponse, toolUseResponse, type JobSpec } from "@auriga/core";
import { StubProvider } from "@auriga/provider";
import { LocalSandboxDriver } from "@auriga/sandbox";
import { loadBundleFromDir, openDevRegistry } from "@auriga/skill-registry";
import { InMemoryJobStore } from "./memory-store";
import { Worker } from "./worker";

const EXAMPLE_SKILL_DIR = fileURLToPath(
  new URL("../../../skills/fix-failing-test", import.meta.url),
);
// An empty workspace dir — never "/tmp" (the Worker copies the workspace, and
// copying the system /tmp tree hangs on CI runners).
const EMPTY_WS = await mkdtemp(join(tmpdir(), "auriga-ws-"));

function spec(id: string): JobSpec {
  return {
    id,
    factio: "default",
    created_by: "t",
    goal: "create answer.txt",
    context_refs: { workspace: { kind: "dir", url_or_path: EMPTY_WS } },
    allowed_tools: ["write_file"],
    required_skills: ["fix-failing-test"],
    acceptance_criteria: [{ kind: "file_exists", path: "answer.txt" }],
    budget: { max_tokens: 100_000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 20 },
  };
}

test("the worker feeds per-skill usage back to the registry after a run", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auriga-feedback-"));
  const store = new InMemoryJobStore();
  await store.create(spec("job_fb"));
  try {
    const registry = await openDevRegistry(dir);
    await registry.publish(await loadBundleFromDir(EXAMPLE_SKILL_DIR));

    await new Worker({
      store,
      provider: new StubProvider([
        toolUseResponse("write_file", { path: "answer.txt", content: "x" }),
        textResponse("done"),
      ]),
      model: "stub",
      sandboxDriver: new LocalSandboxDriver(),
      registry,
      trustedKeys: registry.verificationKeys(),
      usageSink: registry,
    }).run("job_fb");

    const stats = await registry.stats("fix-failing-test");
    expect(stats.uses).toBe(1);
    expect(stats.successes).toBe(1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 30_000);
