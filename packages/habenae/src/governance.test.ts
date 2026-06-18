import { test, expect } from "bun:test";
import { PolicyError, type JobSpec } from "@auriga/core";
import { InMemoryJobStore } from "./memory-store";
import { InMemoryPolicy, submitJob } from "./governance";

function spec(overrides: Partial<JobSpec> = {}): JobSpec {
  return {
    id: "j",
    factio: "acme",
    created_by: "u",
    goal: "g",
    context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
    allowed_tools: ["read_file", "write_file"],
    acceptance_criteria: [{ kind: "file_exists", path: "x" }],
    budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
    ...overrides,
  };
}

const policy = new InMemoryPolicy([
  {
    factio: "acme",
    roles: ["dev", "admin"],
    allowed_tools: ["read_file", "write_file", "bash"],
    allowed_skills: ["fix-failing-test", "lint"],
  },
]);

test("a permitted actor can submit", async () => {
  const store = new InMemoryJobStore();
  const rec = await submitJob({ store, policy, spec: spec(), actor: { factio: "acme", role: "dev" } });
  expect(rec.id).toBe("j");
});

test("cross-tenant submission is denied", async () => {
  const store = new InMemoryJobStore();
  await expect(
    submitJob({ store, policy, spec: spec(), actor: { factio: "other", role: "dev" } }),
  ).rejects.toBeInstanceOf(PolicyError);
});

test("unknown factio is denied", async () => {
  const store = new InMemoryJobStore();
  await expect(
    submitJob({ store, policy, spec: spec({ factio: "ghost" }), actor: { factio: "ghost", role: "dev" } }),
  ).rejects.toBeInstanceOf(PolicyError);
});

test("a role not in the policy is denied", async () => {
  const store = new InMemoryJobStore();
  await expect(
    submitJob({ store, policy, spec: spec(), actor: { factio: "acme", role: "guest" } }),
  ).rejects.toBeInstanceOf(PolicyError);
});

test("a disallowed tool is rejected", async () => {
  const store = new InMemoryJobStore();
  await expect(
    submitJob({
      store,
      policy,
      spec: spec({ allowed_tools: ["read_file", "danger"] }),
      actor: { factio: "acme", role: "dev" },
    }),
  ).rejects.toBeInstanceOf(PolicyError);
});

test("allowed_skills is narrowed to the tenant's permitted set", async () => {
  const store = new InMemoryJobStore();
  await submitJob({
    store,
    policy,
    spec: spec({ allowed_skills: ["fix-failing-test", "not-permitted"] }),
    actor: { factio: "acme", role: "dev" },
  });
  expect((await store.get("j"))?.spec.allowed_skills).toEqual(["fix-failing-test"]);
});

test("a cross-tenant dependency is rejected", async () => {
  const store = new InMemoryJobStore();
  // a job owned by a different tenant
  await store.create(spec({ id: "other-dep", factio: "rival" }));
  await expect(
    submitJob({
      store,
      policy,
      spec: spec({ id: "dependent", depends_on: ["other-dep"] }),
      actor: { factio: "acme", role: "dev" },
    }),
  ).rejects.toBeInstanceOf(PolicyError);
});

test("a required skill outside the permitted set is rejected", async () => {
  const store = new InMemoryJobStore();
  await expect(
    submitJob({
      store,
      policy,
      spec: spec({ required_skills: ["secret-skill"] }),
      actor: { factio: "acme", role: "dev" },
    }),
  ).rejects.toBeInstanceOf(PolicyError);
});
