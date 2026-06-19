import { Hono } from "hono";
import type { Context } from "hono";
import { isTerminal, parseJobSpec, PolicyError, type JobState } from "@auriga/core";
import {
  buildDashboard,
  parseConfig,
  safeAudit,
  submitJob,
  type AuditLog,
  type ConfigStore,
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
  /** Optional background job runner. Absent (e.g. no ANTHROPIC_API_KEY) → POST /jobs/:id/run is 503. */
  runJob?: (jobId: string) => void;
  /** Optional runtime config store (policies + quotas). Absent → /config is 501. */
  config?: ConfigStore;
}

/** Job states for which a run is already in progress (a new run is rejected). */
const ACTIVE_STATES = ["planning", "running", "verifying"];

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
      const record = await submitJob({
        store: deps.store,
        policy: deps.policy,
        spec,
        actor,
        audit: deps.audit,
      });
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
    await safeAudit(deps.audit, {
      factio: rec.spec.factio,
      actor: actor.role,
      action: "job.approved",
      job_id: id,
    });
    return c.json({ approved: true });
  });

  // Kick the job to run in the background (dev-grade, in-process). 202 = accepted.
  app.post("/jobs/:id/run", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    const id = c.req.param("id");
    const rec = await deps.store.get(id);
    if (!rec || rec.spec.factio !== actor.factio) return c.json({ error: "not found" }, 404);
    if (!deps.runJob)
      return c.json({ error: "execution not configured (set ANTHROPIC_API_KEY)" }, 503);
    if (ACTIVE_STATES.includes(rec.state))
      return c.json({ error: `job is already ${rec.state}` }, 409);
    if (rec.spec.require_approval && !rec.approved) return c.json({ error: "approve first" }, 409);
    // Clear any stale cancel signal so re-running a cancelled/failed job isn't cancelled at once.
    if (rec.cancel_requested) await deps.store.update(id, { cancel_requested: false });
    deps.runJob(id);
    await safeAudit(deps.audit, {
      factio: rec.spec.factio,
      actor: actor.role,
      action: "job.run_requested",
      job_id: id,
    });
    return c.json({ running: true }, 202);
  });

  // Cooperative cancellation. An active job is signalled (the runner stops at its next
  // checkpoint and finalizes `cancelled`); an idle job is marked `cancelled` directly.
  // NOTE: read→check→update is not atomic. In the single-process dev runner the window is
  // tiny and benign (the active branch only sets cancel_requested, which a finished job
  // ignores). A production multi-worker deployment should make this a conditional UPDATE
  // (e.g. `... where state not in (terminal)`), which the Postgres store can support.
  app.post("/jobs/:id/cancel", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    const id = c.req.param("id");
    const rec = await deps.store.get(id);
    if (!rec || rec.spec.factio !== actor.factio) return c.json({ error: "not found" }, 404);
    if (isTerminal(rec.state as JobState))
      return c.json({ error: `job is already ${rec.state}` }, 409);
    const active = ACTIVE_STATES.includes(rec.state);
    await deps.store.update(
      id,
      active
        ? { cancel_requested: true }
        : { state: "cancelled", reason: "cancellation requested", cancel_requested: true },
    );
    await safeAudit(deps.audit, {
      factio: rec.spec.factio,
      actor: actor.role,
      action: "job.cancel_requested",
      job_id: id,
    });
    return c.json({ cancelling: active, state: active ? rec.state : "cancelled" });
  });

  // Runtime config: GET is an open governance view; PUT rewrites RBAC/quotas so it
  // requires an authenticated `admin` (defense-in-depth on top of the proxy).
  app.get("/config", async (c) => {
    if (!deps.config) return c.json({ error: "config not available" }, 501);
    return c.json(await deps.config.get());
  });

  app.put("/config", async (c) => {
    if (!deps.config) return c.json({ error: "config not available" }, 501);
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    if (actor.role !== "admin") return c.json({ error: "admin role required" }, 403);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    try {
      const cfg = parseConfig(body);
      await deps.config.set(cfg);
      await safeAudit(deps.audit, {
        factio: actor.factio,
        actor: actor.role,
        action: "config.updated",
        job_id: null,
      });
      return c.json(cfg);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "invalid config" }, 400);
    }
  });

  // Aggregate governance views + console (deployment gates these at the proxy).
  app.get("/dashboard", async (c) =>
    c.json(await buildDashboard({ store: deps.store, audit: deps.audit })),
  );

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
