import { test, expect } from "bun:test";
import type { JobSpec } from "@auriga/core";
import {
  InMemoryAuditLog,
  InMemoryConfigStore,
  InMemoryEventBus,
  InMemoryJobStore,
  InMemoryPolicy,
  liveEvent,
} from "@auriga/habenae";
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

test("GET /config returns the config; PUT requires admin + validates + audits", async () => {
  const d = deps();
  const config = new InMemoryConfigStore();
  const app = createApp({ ...d, config });

  // open GET
  const got = (await (await app.request("/config")).json()) as { quotas: { global: number } };
  expect(got.quotas.global).toBe(2);

  // non-admin → 403
  const denied = await app.request("/config", {
    method: "PUT",
    headers: { "content-type": "application/json", ...AUTH }, // role "dev"
    body: JSON.stringify(got),
  });
  expect(denied.status).toBe(403);

  // admin → 200 + persisted + audited
  const next = {
    policies: [{ factio: "default", roles: ["admin"] }],
    quotas: { global: 9, perFactio: 3 },
  };
  const ok = await app.request("/config", {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "x-auriga-factio": "default",
      "x-auriga-role": "admin",
    },
    body: JSON.stringify(next),
  });
  expect(ok.status).toBe(200);
  expect((await config.get()).quotas.global).toBe(9);

  const audit = (await (await app.request("/audit")).json()) as Array<{ action: string }>;
  expect(audit.map((e) => e.action)).toContain("config.updated");
});

test("PUT /config rejects an invalid shape (400) and 401 without auth", async () => {
  const app = createApp({ ...deps(), config: new InMemoryConfigStore() });
  const admin = { "x-auriga-factio": "default", "x-auriga-role": "admin" };
  const bad = await app.request("/config", {
    method: "PUT",
    headers: { "content-type": "application/json", ...admin },
    body: JSON.stringify({ policies: [], quotas: { global: 0, perFactio: 1 } }),
  });
  expect(bad.status).toBe(400);
  expect((await app.request("/config", { method: "PUT", body: "{}" })).status).toBe(401);
});

test("GET /config is 501 when no config store is wired", async () => {
  const app = createApp(deps());
  expect((await app.request("/config")).status).toBe(501);
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

test("POST /jobs/:id/cancel: idle job → cancelled, active job → signalled", async () => {
  const d = deps();
  const app = createApp(d);
  await d.store.create(spec);

  // pending (idle) → marked cancelled immediately
  const res = await post(app, "/jobs/job_api/cancel", {}, AUTH);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ cancelling: false, state: "cancelled" });
  expect((await d.store.get("job_api"))?.state).toBe("cancelled");

  // running (active) → cancel_requested set, state left for the runner to finalize
  await d.store.create({ ...spec, id: "job_run" });
  await d.store.update("job_run", { state: "running" });
  const res2 = await post(app, "/jobs/job_run/cancel", {}, AUTH);
  expect(res2.status).toBe(200);
  expect(await res2.json()).toEqual({ cancelling: true, state: "running" });
  const rec = await d.store.get("job_run");
  expect(rec?.cancel_requested).toBe(true);
  expect(rec?.state).toBe("running");

  const audit = (await (await app.request("/audit")).json()) as Array<{ action: string }>;
  expect(audit.map((e) => e.action)).toContain("job.cancel_requested");
});

test("POST /jobs/:id/cancel is 409 for a terminal job and 404 cross-tenant", async () => {
  const d = deps();
  const app = createApp(d);
  await d.store.create(spec);
  await d.store.update("job_api", { state: "done" });
  expect((await post(app, "/jobs/job_api/cancel", {}, AUTH)).status).toBe(409);
  expect(
    (
      await post(
        app,
        "/jobs/job_api/cancel",
        {},
        { "x-auriga-factio": "other", "x-auriga-role": "dev" },
      )
    ).status,
  ).toBe(404);
  expect((await post(app, "/jobs/job_api/cancel", {})).status).toBe(401);
});

// Parse Hono SSE text into [{ id, data }] frames.
function sseFrames(body: string): Array<{ id: number; data: { kind: string } }> {
  return body
    .split("\n\n")
    .filter((f) => f.includes("data:"))
    .map((frame) => {
      const id = Number(/id:\s*(\d+)/.exec(frame)?.[1]);
      const data = JSON.parse(/data:\s*(.+)/.exec(frame)?.[1] ?? "{}");
      return { id, data };
    });
}

async function seedLiveJob(): Promise<{
  app: ReturnType<typeof createApp>;
  store: InMemoryJobStore;
  bus: InMemoryEventBus;
}> {
  const d = deps();
  const bus = new InMemoryEventBus();
  const app = createApp({ ...d, bus });
  await d.store.create(spec);
  // A complete run: planning → progress → done sentinel.
  await bus.publish(
    liveEvent("job_api", "acme", { kind: "state", state: "planning", reason: null }),
  );
  await bus.publish(
    liveEvent("job_api", "acme", {
      kind: "progress",
      attempt: 1,
      steps: 1,
      usage: { input_tokens: 1, output_tokens: 1 },
      cost_usd: 0,
    }),
  );
  await bus.publish(liveEvent("job_api", "acme", { kind: "done", state: "done", reason: null }));
  return { app, store: d.store, bus };
}

test("GET /jobs/:id/events replays live events in order and closes on done", async () => {
  const { app } = await seedLiveJob();
  const res = await app.request("/jobs/job_api/events", { headers: AUTH });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");

  const frames = sseFrames(await res.text());
  expect(frames.map((f) => f.id)).toEqual([1, 2, 3]);
  expect(frames.map((f) => f.data.kind)).toEqual(["state", "progress", "done"]);
});

test("GET /jobs/:id/events backfills only events after the ?after= cursor", async () => {
  const { app } = await seedLiveJob();
  const res = await app.request("/jobs/job_api/events?after=2", { headers: AUTH });
  const frames = sseFrames(await res.text());
  expect(frames.map((f) => f.id)).toEqual([3]);
  expect(frames.map((f) => f.data.kind)).toEqual(["done"]);
});

test("GET /jobs/:id/events: 401 without auth, 404 cross-tenant, 501 without a bus", async () => {
  const { app, store } = await seedLiveJob();
  expect((await app.request("/jobs/job_api/events")).status).toBe(401);
  expect(
    (
      await app.request("/jobs/job_api/events", {
        headers: { "x-auriga-factio": "other", "x-auriga-role": "dev" },
      })
    ).status,
  ).toBe(404);

  const noBus = createApp({ store, audit: new InMemoryAuditLog(), policy: new InMemoryPolicy([]) });
  expect((await noBus.request("/jobs/job_api/events", { headers: AUTH })).status).toBe(501);
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
