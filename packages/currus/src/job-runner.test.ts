import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { textResponse, toolUseResponse, type JobSpec } from "@auriga/core";
import { StubProvider } from "@auriga/provider";
import { LocalSandboxDriver, type Sandbox } from "@auriga/sandbox";
import { loadBundleFromDir, openDevRegistry } from "@auriga/skill-registry";
import { runJob, type JobEvent } from "./job-runner";

const EXAMPLE_SKILL_DIR = fileURLToPath(
  new URL("../../../skills/fix-failing-test", import.meta.url),
);

function makeSpec(overrides: Partial<JobSpec>): JobSpec {
  return {
    id: "job_test",
    factio: "default",
    created_by: "test",
    goal: "create answer.txt",
    context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
    allowed_tools: [],
    acceptance_criteria: [{ kind: "file_exists", path: "answer.txt" }],
    budget: { max_tokens: 100_000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 20 },
    ...overrides,
  };
}

async function emptySandbox(): Promise<Sandbox> {
  return new LocalSandboxDriver().create({ workspace: { kind: "empty" } });
}

test("completes on the first attempt once verification passes", async () => {
  const sandbox = await emptySandbox();
  const events: JobEvent[] = [];
  try {
    const provider = new StubProvider([
      toolUseResponse("write_file", { path: "answer.txt", content: "42" }),
      textResponse("done"),
    ]);
    const result = await runJob({
      spec: makeSpec({ allowed_tools: ["write_file"] }),
      provider,
      model: "stub",
      sandbox,
      onEvent: (e) => events.push(e),
    });
    expect(result.state).toBe("done");
    expect(result.attempts).toBe(1);
    expect(await sandbox.readFile("answer.txt")).toBe("42");
    expect(events.some((e) => e.type === "verify" && e.passed)).toBe(true);
  } finally {
    await sandbox.destroy();
  }
});

test("retries after a failed verification, then succeeds", async () => {
  const sandbox = await emptySandbox();
  try {
    const provider = new StubProvider([
      textResponse("I think it's done"), // attempt 1: nothing written → verify fails
      toolUseResponse("write_file", { path: "answer.txt", content: "x" }), // attempt 2
      textResponse("now done"),
    ]);
    const result = await runJob({
      spec: makeSpec({ allowed_tools: ["write_file"] }),
      provider,
      model: "stub",
      sandbox,
    });
    expect(result.state).toBe("done");
    expect(result.attempts).toBe(2);
  } finally {
    await sandbox.destroy();
  }
});

test("fails when verification never passes within the attempt budget", async () => {
  const sandbox = await emptySandbox();
  try {
    const provider = new StubProvider([textResponse("done"), textResponse("done again")]);
    const result = await runJob({
      spec: makeSpec({ allowed_tools: ["write_file"] }),
      provider,
      model: "stub",
      sandbox,
      maxAttempts: 2,
    });
    expect(result.state).toBe("failed");
    expect(result.attempts).toBe(2);
    expect(result.verification?.passed).toBe(false);
  } finally {
    await sandbox.destroy();
  }
});

test("terminates when the token budget is exhausted", async () => {
  const sandbox = await emptySandbox();
  try {
    const provider = new StubProvider([
      textResponse("nope", { usage: { input_tokens: 10, output_tokens: 0 } }),
    ]);
    const result = await runJob({
      spec: makeSpec({ allowed_tools: ["write_file"], budget: { max_tokens: 5, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 20 } }),
      provider,
      model: "stub",
      sandbox,
    });
    expect(result.state).toBe("failed");
    expect(result.reason).toContain("token budget");
  } finally {
    await sandbox.destroy();
  }
});

test("require_approval with no approval gate fails closed (pauses)", async () => {
  const sandbox = await emptySandbox();
  try {
    const result = await runJob({
      spec: makeSpec({ allowed_tools: ["write_file"], require_approval: true }),
      provider: new StubProvider([]), // pauses before any model call
      model: "stub",
      sandbox,
      // no approvalGate provided on purpose
    });
    expect(result.state).toBe("paused");
    expect(result.reason).toContain("approval");
  } finally {
    await sandbox.destroy();
  }
});

test("mounts and records a required skill, then completes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auriga-jobskill-"));
  const sandbox = await emptySandbox();
  try {
    const registry = await openDevRegistry(dir);
    await registry.publish(await loadBundleFromDir(EXAMPLE_SKILL_DIR));

    const provider = new StubProvider([
      toolUseResponse("write_file", { path: "answer.txt", content: "x" }),
      textResponse("done"),
    ]);
    const result = await runJob({
      spec: makeSpec({ allowed_tools: ["write_file"], required_skills: ["fix-failing-test"] }),
      provider,
      model: "stub",
      sandbox,
      registry,
      trustedKeys: registry.verificationKeys(),
    });

    expect(result.state).toBe("done");
    expect(result.loadedSkills.map((s) => s.name)).toContain("fix-failing-test");
    expect(await sandbox.exists(".skills/fix-failing-test/SKILL.md")).toBe(true);
  } finally {
    await sandbox.destroy();
    await rm(dir, { recursive: true, force: true });
  }
});
