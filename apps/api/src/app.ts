import { Hono } from "hono";
import { parseJobSpec, PolicyError } from "@auriga/core";
import { buildDashboard, submitJob, type AuditLog, type JobStore, type Policy } from "@auriga/habenae";
import { searchSkills, type MarketplaceDeps } from "@auriga/skill-registry";
import { CONSOLE_HTML } from "./console";

export interface ApiDeps {
  store: JobStore;
  policy: Policy;
  audit: AuditLog;
  /** Optional skill marketplace ({ registry, stats }). */
  marketplace?: MarketplaceDeps;
}

/**
 * The Auriga control-plane HTTP API (a "surface"). Read endpoints + governed
 * submit/approve. Running jobs is the worker/scheduler's job, not the API's, so
 * POST /jobs creates a *pending* job.
 */
export function createApp(deps: ApiDeps): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/jobs", async (c) => {
    const factio = c.req.query("factio");
    return c.json(factio ? await deps.store.listByFactio(factio) : await deps.store.list());
  });

  app.get("/jobs/:id", async (c) => {
    const rec = await deps.store.get(c.req.param("id"));
    return rec ? c.json(rec) : c.json({ error: "not found" }, 404);
  });

  app.get("/jobs/:id/trace", async (c) => {
    const trace = await deps.store.loadTrace(c.req.param("id"));
    return trace ? c.json(trace) : c.json({ error: "no trace" }, 404);
  });

  app.post("/jobs", async (c) => {
    let body: { spec?: unknown; actor?: { factio?: string; role?: string } };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    const actor = body.actor;
    if (!actor?.factio || !actor?.role) {
      return c.json({ error: "actor { factio, role } is required" }, 400);
    }
    let spec: ReturnType<typeof parseJobSpec>;
    try {
      spec = parseJobSpec(body.spec);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "invalid spec" }, 400);
    }
    try {
      const record = await submitJob({
        store: deps.store,
        policy: deps.policy,
        spec,
        actor: { factio: actor.factio, role: actor.role },
        audit: deps.audit,
      });
      return c.json(record, 201);
    } catch (err) {
      if (err instanceof PolicyError) return c.json({ error: err.message }, 403);
      throw err;
    }
  });

  app.post("/jobs/:id/approve", async (c) => {
    const id = c.req.param("id");
    const rec = await deps.store.get(id);
    if (!rec) return c.json({ error: "not found" }, 404);
    await deps.store.update(id, { approved: true });
    await deps.audit.record({ factio: rec.spec.factio, actor: "api", action: "job.approved", job_id: id });
    return c.json({ approved: true });
  });

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
