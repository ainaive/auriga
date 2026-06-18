import { test, expect } from "bun:test";
import type { JobSpec } from "@auriga/core";
import { InMemoryAuditLog, InMemoryJobStore, InMemoryPolicy } from "@auriga/habenae";
import { createApp } from "./app";

function deps() {
  return {
    store: new InMemoryJobStore(),
    audit: new InMemoryAuditLog(),
    policy: new InMemoryPolicy([{ factio: "acme", roles: ["dev"] }]),
  };
}

const spec: JobSpec = {
  id: "job_api",
  factio: "acme",
  created_by: "u",
  goal: "g",
  context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
  allowed_tools: ["write_file"],
  acceptance_criteria: [{ kind: "file_exists", path: "x" }],
  budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
};

function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

test("health", async () => {
  const app = createApp(deps());
  const res = await app.request("/health");
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
});

test("submit → list → get → approve, with audit", async () => {
  const d = deps();
  const app = createApp(d);

  const submitRes = await post(app, "/jobs", { spec, actor: { factio: "acme", role: "dev" } });
  expect(submitRes.status).toBe(201);

  const listRes = await app.request("/jobs?factio=acme");
  const listed = (await listRes.json()) as Array<{ id: string }>;
  expect(listed.map((j) => j.id)).toContain("job_api");

  const getRes = await app.request("/jobs/job_api");
  expect(getRes.status).toBe(200);

  const approveRes = await post(app, "/jobs/job_api/approve", {});
  expect(await approveRes.json()).toEqual({ approved: true });
  expect((await d.store.get("job_api"))?.approved).toBe(true);

  const audit = (await (await app.request("/audit")).json()) as Array<{ action: string }>;
  const actions = audit.map((e) => e.action);
  expect(actions).toContain("job.created");
  expect(actions).toContain("job.approved");
});

test("policy-denied submit returns 403", async () => {
  const app = createApp(deps());
  const res = await post(app, "/jobs", { spec, actor: { factio: "acme", role: "guest" } });
  expect(res.status).toBe(403);
});

test("invalid spec returns 400", async () => {
  const app = createApp(deps());
  const res = await post(app, "/jobs", { spec: { id: "bad" }, actor: { factio: "acme", role: "dev" } });
  expect(res.status).toBe(400);
});

test("missing job 404s", async () => {
  const app = createApp(deps());
  expect((await app.request("/jobs/nope")).status).toBe(404);
  expect((await app.request("/jobs/nope/trace")).status).toBe(404);
});

test("dashboard + console render", async () => {
  const app = createApp(deps());
  const dash = (await (await app.request("/dashboard")).json()) as { totals?: unknown };
  expect(dash.totals).toBeDefined();

  const home = await app.request("/");
  expect(home.headers.get("content-type")).toContain("text/html");
  expect(await home.text()).toContain("Auriga");
});

test("skills endpoint returns [] without a marketplace", async () => {
  const app = createApp(deps());
  expect(await (await app.request("/skills")).json()).toEqual([]);
});
