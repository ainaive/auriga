import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PolicyError, type JobSpec } from "@auriga/core";
import { FileAuditLog, InMemoryAuditLog, type AuditLog } from "./audit";
import { InMemoryJobStore } from "./memory-store";
import { InMemoryPolicy, submitJob } from "./governance";

function spec(overrides: Partial<JobSpec> = {}): JobSpec {
  return {
    id: "j",
    factio: "acme",
    created_by: "u",
    goal: "g",
    context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
    allowed_tools: ["read_file"],
    acceptance_criteria: [{ kind: "file_exists", path: "x" }],
    budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
    ...overrides,
  };
}

const policy = new InMemoryPolicy([{ factio: "acme", roles: ["dev"] }]);

async function shared(audit: AuditLog) {
  await audit.record({ factio: "a", actor: "u", action: "job.created", job_id: "1" });
  await audit.record({ factio: "b", actor: "u", action: "job.failed", job_id: "2" });
  await audit.record({ factio: "a", actor: "u", action: "job.completed", job_id: "1" });

  const all = await audit.list();
  expect(all).toHaveLength(3);
  // most recent first
  expect(all[0]?.action).toBe("job.completed");
  expect(all[0]?.id).toMatch(/^aud_/);
  expect(all[0]?.ts).toBeDefined();

  const factioA = await audit.listByFactio("a");
  expect(factioA.map((e) => e.job_id)).toEqual(["1", "1"]);

  expect(await audit.list(1)).toHaveLength(1);
  expect(await audit.list(0)).toHaveLength(0); // limit=0 means zero, not "all"
}

test("InMemoryAuditLog is append-only + ordered + tenant-filterable", async () => {
  await shared(new InMemoryAuditLog());
});

test("FileAuditLog persists to jsonl with the same contract", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auriga-audit-"));
  try {
    await shared(new FileAuditLog(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("submitJob records job.created on success and policy.denied on denial", async () => {
  const store = new InMemoryJobStore();
  const audit = new InMemoryAuditLog();

  await submitJob({ store, policy, spec: spec(), actor: { factio: "acme", role: "dev" }, audit });
  await expect(
    submitJob({
      store,
      policy,
      spec: spec({ id: "j2" }),
      actor: { factio: "acme", role: "guest" },
      audit,
    }),
  ).rejects.toBeInstanceOf(PolicyError);

  const actions = (await audit.list()).map((e) => e.action);
  expect(actions).toContain("job.created");
  expect(actions).toContain("policy.denied");
});
