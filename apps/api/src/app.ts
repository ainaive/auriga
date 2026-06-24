import { Hono } from "hono";
import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import {
  isTerminal,
  parseJobSpec,
  PolicyError,
  type JobEventEnvelope,
  type JobState,
} from "@auriga/core";
import {
  buildDashboard,
  mergeProviderSecrets,
  parseConfig,
  redactConfig,
  safeAudit,
  submitJob,
  type AuditLog,
  type ConfigStore,
  type EventBus,
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
  /** Optional live event bus. Absent → GET /jobs/:id/events is 501. */
  bus?: EventBus;
}

/** Job states for which a run is already in progress (a new run is rejected). */
const ACTIVE_STATES = ["planning", "running", "verifying"];

/** All job lifecycle states (for query validation on GET /jobs). */
const JOB_STATES = [
  "pending",
  "planning",
  "running",
  "verifying",
  "done",
  "failed",
  "paused",
  "cancelled",
];

/** Parse a bounded integer query param; returns null if present-but-invalid. */
function clampInt(raw: string | undefined, def: number, min: number, max: number): number | null {
  if (raw === undefined) return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

/** Parse a Last-Event-ID / ?after= cursor into a non-negative seq (0 = from the start). */
function toSeq(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Cap a single workspace file response so a multi-MB snapshot can't ship at once. */
const MAX_FILE_BYTES = 256 * 1024;

/** Decoded byte length of a base64 string without materializing the bytes. */
function base64Bytes(b64: string): number {
  if (b64.length === 0) return 0;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** Decode a base64 workspace file: UTF-8 text, or base64 passthrough for binary (NUL byte). */
function decodeFile(b64: string): {
  bytes: number;
  truncated: boolean;
  encoding: "utf8" | "base64";
  content: string;
} {
  const buf = Buffer.from(b64, "base64");
  const bytes = buf.length;
  const truncated = bytes > MAX_FILE_BYTES;
  const slice = truncated ? buf.subarray(0, MAX_FILE_BYTES) : buf;
  // NUL byte ⇒ treat as binary (text files don't contain NUL); avoids garbled UTF-8.
  if (buf.includes(0)) {
    return { bytes, truncated, encoding: "base64", content: slice.toString("base64") };
  }
  return { bytes, truncated, encoding: "utf8", content: slice.toString("utf8") };
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

  // Tenant-scoped, filtered + paged job list. Filters are applied in the API layer over
  // listByFactio (works for every store driver); a Postgres deployment should push the
  // predicate + limit/offset into an indexed query (`where state=… and created_at between …
  // order by created_at desc`) — a follow-up, like the conditional-cancel note below.
  app.get("/jobs", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required (x-auriga-factio, x-auriga-role)" }, 401);

    const state = c.req.query("state");
    if (state && !JOB_STATES.includes(state))
      return c.json({ error: `invalid state: ${state}` }, 400);
    const limit = clampInt(c.req.query("limit"), 25, 1, 100);
    if (limit === null) return c.json({ error: "invalid limit (1..100)" }, 400);
    const offset = clampInt(c.req.query("offset"), 0, 0, Number.MAX_SAFE_INTEGER);
    if (offset === null) return c.json({ error: "invalid offset" }, 400);
    const q = c.req.query("q")?.toLowerCase();
    const afterRaw = c.req.query("created_after");
    const beforeRaw = c.req.query("created_before");
    // Parse to epoch ms so date-only ISO inputs compare correctly and malformed
    // values 400 (rather than silently misfiltering via raw string comparison).
    const after = afterRaw ? Date.parse(afterRaw) : undefined;
    const before = beforeRaw ? Date.parse(beforeRaw) : undefined;
    if (after !== undefined && Number.isNaN(after))
      return c.json({ error: "invalid created_after (ISO date)" }, 400);
    if (before !== undefined && Number.isNaN(before))
      return c.json({ error: "invalid created_before (ISO date)" }, 400);

    let jobs = await deps.store.listByFactio(actor.factio);
    if (state) jobs = jobs.filter((j) => j.state === state);
    if (q)
      jobs = jobs.filter(
        (j) => j.id.toLowerCase().includes(q) || j.spec.goal.toLowerCase().includes(q),
      );
    if (after !== undefined) jobs = jobs.filter((j) => Date.parse(j.created_at) >= after);
    if (before !== undefined) jobs = jobs.filter((j) => Date.parse(j.created_at) <= before);
    // Newest first; stable tiebreak on id so paging is deterministic.
    jobs.sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id.localeCompare(b.id),
    );

    const total = jobs.length;
    return c.json({ jobs: jobs.slice(offset, offset + limit), total, limit, offset });
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

  // Workspace inspection: the latest checkpoint snapshot the worker already persists.
  // Tenant-scoped like /trace. The manifest lists paths + sizes only (no base64); the
  // file route decodes a single file (capped; binary → base64 passthrough).
  app.get("/jobs/:id/workspace", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    const id = c.req.param("id");
    const rec = await deps.store.get(id);
    if (!rec || rec.spec.factio !== actor.factio) return c.json({ error: "not found" }, 404);
    const cp = await deps.store.loadCheckpoint(id);
    const files = cp
      ? Object.entries(cp.workspace)
          .map(([path, b64]) => ({ path, bytes: base64Bytes(b64) }))
          .sort((a, b) => a.path.localeCompare(b.path))
      : [];
    return c.json({ job_id: id, files });
  });

  app.get("/jobs/:id/workspace/file", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    const id = c.req.param("id");
    const rec = await deps.store.get(id);
    if (!rec || rec.spec.factio !== actor.factio) return c.json({ error: "not found" }, 404);
    const path = c.req.query("path");
    if (!path) return c.json({ error: "path required" }, 400);
    const cp = await deps.store.loadCheckpoint(id);
    const b64 = cp?.workspace[path];
    if (b64 === undefined) return c.json({ error: "file not found" }, 404);
    return c.json({ path, ...decodeFile(b64) });
  });

  // Live run events (SSE). Tenant-scoped like /jobs/:id/trace. Backfills via
  // Last-Event-ID / ?after= then tails the bus until the terminal `done` envelope.
  // Subscribe BEFORE backfilling so no event slips through the gap; write() dedupes
  // the replay/live overlap on the monotonic per-job `seq`.
  app.get("/jobs/:id/events", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    const id = c.req.param("id");
    const rec = await deps.store.get(id);
    if (!rec || rec.spec.factio !== actor.factio) return c.json({ error: "not found" }, 404);
    if (!deps.bus) return c.json({ error: "events not available" }, 501);
    const bus = deps.bus;
    const after = toSeq(c.req.header("Last-Event-ID") ?? c.req.query("after"));

    return streamSSE(c, async (stream) => {
      let lastSeq = after;
      const write = async (env: JobEventEnvelope) => {
        if (env.seq <= lastSeq) return; // skip anything already delivered
        lastSeq = env.seq;
        await stream.writeSSE({ id: String(env.seq), data: JSON.stringify(env.data) });
      };

      const buffered: JobEventEnvelope[] = [];
      let wake: (() => void) | undefined;
      let aborted = false;
      // Subscribe (awaiting LISTEN attachment) BEFORE backfilling so no event slips
      // through the gap; write() dedupes the replay/live overlap on `seq`.
      const unsub = await bus.subscribe(id, (env) => {
        buffered.push(env);
        wake?.();
      });
      stream.onAbort(() => {
        aborted = true;
        wake?.();
      });

      try {
        let done = false;
        const flush = async (envs: JobEventEnvelope[]) => {
          for (const env of envs) {
            await write(env);
            if (env.data.kind === "done") done = true;
          }
        };
        await flush(await bus.replay(id, after));
        while (!done && !aborted) {
          if (buffered.length === 0) {
            await new Promise<void>((resolve) => {
              wake = resolve;
              // Guard the race: if an event arrived or the client aborted between the
              // emptiness check and this assignment, resolve now instead of hanging.
              if (aborted || buffered.length > 0) {
                wake = undefined;
                resolve();
              }
            });
            wake = undefined;
            continue;
          }
          await flush(buffered.splice(0, buffered.length));
        }
      } finally {
        unsub();
      }
    });
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
    // Clear any stale cancel/pause signal so re-running (or resuming) doesn't stop at once.
    if (rec.cancel_requested || rec.pause_requested)
      await deps.store.update(id, { cancel_requested: false, pause_requested: false });
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

  // Cooperative pause: signals an active run to stop resumably at its next attempt
  // boundary (state → `paused`, checkpoint kept). Resume via POST /jobs/:id/run, which
  // clears the pause signal. Only an active run can be paused.
  app.post("/jobs/:id/pause", async (c) => {
    const actor = actorOf(c);
    if (!actor) return c.json({ error: "auth required" }, 401);
    const id = c.req.param("id");
    const rec = await deps.store.get(id);
    if (!rec || rec.spec.factio !== actor.factio) return c.json({ error: "not found" }, 404);
    if (!ACTIVE_STATES.includes(rec.state))
      return c.json({ error: `cannot pause a ${rec.state} job` }, 409);
    await deps.store.update(id, { pause_requested: true });
    await safeAudit(deps.audit, {
      factio: rec.spec.factio,
      actor: actor.role,
      action: "job.pause_requested",
      job_id: id,
    });
    return c.json({ pausing: true });
  });

  // Runtime config: GET is an open governance view (provider apiKeys are REDACTED — only a
  // `configured` flag + baseURL are returned); PUT rewrites RBAC/quotas/provider creds so it
  // requires an authenticated `admin` (defense-in-depth on top of the proxy).
  app.get("/config", async (c) => {
    if (!deps.config) return c.json({ error: "config not available" }, 501);
    return c.json(redactConfig(await deps.config.get()));
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
      // Merge provider secrets onto the stored config (omitted apiKey ⇒ keep, "" ⇒ clear),
      // so the admin never needs the plaintext key the redacted GET withheld.
      const incoming = parseConfig(body);
      const merged = mergeProviderSecrets(incoming, await deps.config.get());
      await deps.config.set(merged); // throws if a key is set without AURIGA_CONFIG_SECRET
      await safeAudit(deps.audit, {
        factio: actor.factio,
        actor: actor.role,
        action: "config.updated",
        job_id: null,
      });
      return c.json(redactConfig(merged)); // never echo secrets back
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "invalid config" }, 400);
    }
  });

  // Aggregate governance views + console (deployment gates these at the proxy).
  // Joins the config quotas (if a config store is wired) so the console can render
  // quota-utilization bars from `active` vs. the limits.
  app.get("/dashboard", async (c) => {
    const data = await buildDashboard({ store: deps.store, audit: deps.audit });
    const quotas = deps.config ? (await deps.config.get()).quotas : undefined;
    return c.json(quotas ? { ...data, quotas } : data);
  });

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
