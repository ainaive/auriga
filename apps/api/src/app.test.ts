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

const AUTH = { "x-auriga-factio": "acme", "x-auriga-role": "dev" };

function post(
  app: ReturnType<typeof createApp>,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
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

  const submitRes = await post(app, "/jobs", { spec }, AUTH);
  expect(submitRes.status).toBe(201);

  const listRes = await app.request("/jobs", { headers: AUTH });
  const listed = (await listRes.json()) as Array<{ id: string }>;
  expect(listed.map((j) => j.id)).toContain("job_api");

  const getRes = await app.request("/jobs/job_api", { headers: AUTH });
  expect(getRes.status).toBe(200);

  const approveRes = await post(app, "/jobs/job_api/approve", {}, AUTH);
  expect(await approveRes.json()).toEqual({ approved: true });
  expect((await d.store.get("job_api"))?.approved).toBe(true);

  const audit = (await (await app.request("/audit")).json()) as Array<{ action: string }>;
  const actions = audit.map((e) => e.action);
  expect(actions).toContain("job.created");
  expect(actions).toContain("job.approved");
});

test("policy-denied submit returns 403", async () => {
  const app = createApp(deps());
  const res = await post(
    app,
    "/jobs",
    { spec },
    { "x-auriga-factio": "acme", "x-auriga-role": "guest" },
  );
  expect(res.status).toBe(403);
});

test("invalid spec returns 400", async () => {
  const app = createApp(deps());
  const res = await post(app, "/jobs", { spec: { id: "bad" } }, AUTH);
  expect(res.status).toBe(400);
});

test("requests without auth headers are 401", async () => {
  const app = createApp(deps());
  expect((await app.request("/jobs")).status).toBe(401);
  expect((await post(app, "/jobs", { spec })).status).toBe(401);
});

test("missing/cross-tenant job 404s (with auth)", async () => {
  const app = createApp(deps());
  expect((await app.request("/jobs/nope", { headers: AUTH })).status).toBe(404);
  expect((await app.request("/jobs/nope/trace", { headers: AUTH })).status).toBe(404);
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

test("POST /jobs/:id/run accepts (202) and invokes the runner", async () => {
  const d = deps();
  const ran: string[] = [];
  const app = createApp({ ...d, runJob: (id) => ran.push(id) });
  await d.store.create(spec);

  const res = await post(app, "/jobs/job_api/run", {}, AUTH);
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ running: true });
  expect(ran).toEqual(["job_api"]);

  const audit = (await (await app.request("/audit")).json()) as Array<{ action: string }>;
  expect(audit.map((e) => e.action)).toContain("job.run_requested");
});

test("POST /jobs/:id/run is 503 when no runner is configured", async () => {
  const d = deps();
  const app = createApp(d); // no runJob
  await d.store.create(spec);
  expect((await post(app, "/jobs/job_api/run", {}, AUTH)).status).toBe(503);
});

test("POST /jobs/:id/run is 409 when the job is already active", async () => {
  const d = deps();
  const ran: string[] = [];
  const app = createApp({ ...d, runJob: (id) => ran.push(id) });
  await d.store.create(spec);
  await d.store.update("job_api", { state: "running" });

  const res = await post(app, "/jobs/job_api/run", {}, AUTH);
  expect(res.status).toBe(409);
  expect(ran).toEqual([]); // not kicked
});

test("POST /jobs/:id/run requires auth and 404s cross-tenant", async () => {
  const d = deps();
  const app = createApp({ ...d, runJob: () => {} });
  await d.store.create(spec);
  expect((await post(app, "/jobs/job_api/run", {})).status).toBe(401);
  expect(
    (
      await post(
        app,
        "/jobs/job_api/run",
        {},
        { "x-auriga-factio": "other", "x-auriga-role": "dev" },
      )
    ).status,
  ).toBe(404);
});
