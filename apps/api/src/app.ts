import { Hono } from "hono";
import type { Context } from "hono";
import { parseJobSpec, PolicyError } from "@auriga/core";
import {
  buildDashboard,
  safeAudit,
  submitJob,
  type AuditLog,
  type JobStore,
  type Policy,
} from "@auriga/habenae";
import { searchSkills, type MarketplaceDeps } from "@auriga/skill-registry";
import { CONSOLE_HTML } from "./console";

export interface ApiDeps {
  store: JobStore;
  policy: Policy;
  audit: AuditLog;
  /** Optional skill marketplace ({ registry, stats }). */
  marketplace?: MarketplaceDeps;
}

/** Caller identity from headers. In production the API sits behind the platform's
 *  OIDC/auth gateway; these headers carry the resolved tenant + role. */
function actorOf(c: Context): { factio: string; role: string } | undefined {
  const factio = c.req.header("x-auriga-factio");
  const role = c.req.header("x-auriga-role");
  return factio && role ? { factio, role } : undefined;
}

/**
 * The Auriga control-plane HTTP API (a "surface"). Per-tenant job data and writes
 * are scoped to the caller's factio (defense-in-depth tenant isolation); the
 * aggregate governance views (dashboard/audit/skills) and the console are open
 * and expected to be gated by the deployment's auth proxy. POST /jobs creates a
 * *pending* job (running is the worker/scheduler's job).
 */
export function createApp(deps: ApiDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/jobs", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required (x-auriga-factio, x-auriga-role)" }, 401);
    return c.json(await deps.store.listByFactio(actor.factio));
  });

  app.get("/jobs/:id", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    const rec = await deps.store.get(c.req.param("id"));
    // 404 (not 403) for cross-tenant ids — don't leak existence across tenants.
    if (!rec || rec.spec.factio !== actor.factio) return c.json({ error: "not found" }, 404);
    return c.json(rec);
  });

  app.get("/jobs/:id/trace", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    const rec = await deps.store.get(c.req.param("id"));
    if (!rec || rec.spec.factio !== actor.factio) return c.json({ error: "not found" }, 404);
    const trace = await deps.store.loadTrace(c.req.param("id"));
    return trace ? c.json(trace) : c.json({ error: "no trace" }, 404);
  });

  app.post("/jobs", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    let body: { spec?: unknown };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    let spec: ReturnType<typeof parseJobSpec>;
    try {
      spec = parseJobSpec(body.spec);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "invalid spec" }, 400);
    }
    try {
      const record = await submitJob({ store: deps.store, policy: deps.policy, spec, actor, audit: deps.audit });
      return c.json(record, 201);
    } catch (err) {
      if (err instanceof PolicyError) return c.json({ error: err.message }, 403);
      throw err;
    }
  });

  app.post("/jobs/:id/approve", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    const id = c.req.param("id");
    const rec = await deps.store.get(id);
    if (!rec || rec.spec.factio !== actor.factio) return c.json({ error: "not found" }, 404);
    await deps.store.update(id, { approved: true });
    await safeAudit(deps.audit, { factio: rec.spec.factio, actor: actor.role, action: "job.approved", job_id: id });
    return c.json({ approved: true });
  });

  // Aggregate governance views + console (deployment gates these at the proxy).
  app.get("/dashboard", async (c) => c.json(await buildDashboard({ store: deps.store, audit: deps.audit })));

  app.get("/audit", async (c) => {
    const factio = c.req.query("factio");
    return c.json(factio ? await deps.audit.listByFactio(factio) : await deps.audit.list());
  });

  app.get("/skills", async (c) => {
    if (!deps.marketplace) return c.json([]);
    const factio = c.req.query("factio") ?? "default";
    const role = c.req.query("role") ?? "viewer";
    const query = c.req.query("q");
    return c.json(await searchSkills(deps.marketplace, { factio, role }, query ? { query } : {}));
  });

  app.get("/", (c) => c.html(CONSOLE_HTML));

  return app;
}
