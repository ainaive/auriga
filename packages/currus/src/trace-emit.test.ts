import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { textResponse, toolUseResponse, type JobSpec, type TraceEvent } from "@auriga/core";
import { StubProvider } from "@auriga/provider";
import { LocalSandboxDriver, type Sandbox } from "@auriga/sandbox";
import { loadBundleFromDir, openDevRegistry } from "@auriga/skill-registry";
import { runJob } from "./job-runner";

const EXAMPLE_SKILL_DIR = fileURLToPath(
  new URL("../../../skills/fix-failing-test", import.meta.url),
);

function makeSpec(overrides: Partial<JobSpec>): JobSpec {
  return {
    id: "job_trace",
    factio: "default",
    created_by: "test",
    goal: "create answer.txt",
    context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
    allowed_tools: ["write_file"],
    acceptance_criteria: [{ kind: "file_exists", path: "answer.txt" }],
    budget: { max_tokens: 100_000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 20 },
    ...overrides,
  };
}

async function emptySandbox(): Promise<Sandbox> {
  return new LocalSandboxDriver().create({ workspace: { kind: "empty" } });
}

test("emits model_response, tool_call, and verify events in order", async () => {
  const sandbox = await emptySandbox();
  const events: TraceEvent[] = [];
  try {
    const provider = new StubProvider([
      toolUseResponse(
        "write_file",
        { path: "answer.txt", content: "42" },
        {
          usage: { input_tokens: 12, output_tokens: 3 },
        },
      ),
      textResponse("done"),
    ]);
    await runJob({
      spec: makeSpec({ allowed_tools: ["write_file"] }),
      provider,
      model: "stub",
      sandbox,
      onTrace: (e) => events.push(e),
    });

    expect(events.map((e) => e.type)).toEqual([
      "model_response",
      "tool_call",
      "model_response",
      "verify",
    ]);

    const models = events.filter((e) => e.type === "model_response");
    expect(models[0]?.response.usage.input_tokens).toBe(12);

    const tools = events.filter((e) => e.type === "tool_call");
    expect(tools[0]?.tool).toBe("write_file");

    const verifies = events.filter((e) => e.type === "verify");
    expect(verifies.at(-1)?.passed).toBe(true);
  } finally {
    await sandbox.destroy();
  }
});

test("records skill_loaded with the exact version for required skills", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auriga-trace-skill-"));
  const sandbox = await emptySandbox();
  const events: TraceEvent[] = [];
  try {
    const registry = await openDevRegistry(dir);
    await registry.publish(await loadBundleFromDir(EXAMPLE_SKILL_DIR));
    const provider = new StubProvider([
      toolUseResponse("write_file", { path: "answer.txt", content: "x" }),
      textResponse("done"),
    ]);
    await runJob({
      spec: makeSpec({ allowed_tools: ["write_file"], required_skills: ["fix-failing-test"] }),
      provider,
      model: "stub",
      sandbox,
      registry,
      trustedKeys: registry.verificationKeys(),
      onTrace: (e) => events.push(e),
    });

    const skillEvents = events.filter((e) => e.type === "skill_loaded");
    expect(skillEvents).toHaveLength(1);
    expect(skillEvents[0]?.skill.name).toBe("fix-failing-test");
    expect(skillEvents[0]?.skill.version).toBe("1.0.0");
    expect(skillEvents[0]?.skill.content_hash.length ?? 0).toBeGreaterThan(0);
  } finally {
    await sandbox.destroy();
    await rm(dir, { recursive: true, force: true });
  }
});
