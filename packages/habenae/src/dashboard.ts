import { estimateCostUsd } from "@auriga/capella";
import type { AuditEvent, AuditLog } from "./audit";
import type { JobRecord, JobStore } from "./types";

export interface TenantSummary {
  factio: string;
  total: number;
  byState: Record<string, number>;
  cost_usd: number;
}

export interface DashboardData {
  totals: { jobs: number; cost_usd: number; tenants: number };
  tenants: TenantSummary[];
  recentAudit: AuditEvent[];
  /** Cost + count bucketed by day (created_at), oldest→newest, last 14 days. */
  costTrend: { bucket: string; jobs: number; cost_usd: number }[];
  /** Cost + count grouped by model, most expensive first. */
  byModel: { model: string; jobs: number; cost_usd: number }[];
  /** In-flight job count per factio (for quota utilization). */
  active: { factio: string; active: number }[];
}

/** States that count against a concurrency quota. */
const ACTIVE = new Set(["planning", "running", "verifying"]);
const TREND_DAYS = 14;

function jobCost(job: JobRecord): number {
  if (!job.model) return 0;
  const c = estimateCostUsd(job.model, job.usage);
  return Number.isFinite(c) ? c : 0;
}

/**
 * Aggregate the data a governance dashboard renders: per-tenant rollups + audit feed.
 * Pass `opts.factio` to scope the rollup (and audit feed) to a single tenant; omit it
 * for the org-wide admin view.
 */
export async function buildDashboard(
  deps: { store: JobStore; audit?: AuditLog },
  opts: { recentLimit?: number; factio?: string } = {},
): Promise<DashboardData> {
  const jobs = opts.factio ? await deps.store.listByFactio(opts.factio) : await deps.store.list();
  const byFactio = new Map<string, TenantSummary>();
  const trend = new Map<string, { jobs: number; cost_usd: number }>();
  const models = new Map<string, { jobs: number; cost_usd: number }>();
  const activeByFactio = new Map<string, number>();

  let totalCost = 0;
  for (const job of jobs) {
    const factio = job.spec.factio;
    let summary = byFactio.get(factio);
    if (!summary) {
      summary = { factio, total: 0, byState: {}, cost_usd: 0 };
      byFactio.set(factio, summary);
    }
    summary.total += 1;
    summary.byState[job.state] = (summary.byState[job.state] ?? 0) + 1;
    const cost = jobCost(job);
    summary.cost_usd += cost;
    totalCost += cost;

    const bucket = job.created_at.slice(0, 10);
    const tb = trend.get(bucket) ?? { jobs: 0, cost_usd: 0 };
    tb.jobs += 1;
    tb.cost_usd += cost;
    trend.set(bucket, tb);

    const model = job.model ?? "—";
    const mb = models.get(model) ?? { jobs: 0, cost_usd: 0 };
    mb.jobs += 1;
    mb.cost_usd += cost;
    models.set(model, mb);

    if (ACTIVE.has(job.state)) activeByFactio.set(factio, (activeByFactio.get(factio) ?? 0) + 1);
  }

  const tenants = [...byFactio.values()].sort((a, b) => a.factio.localeCompare(b.factio));
  const costTrend = [...trend.entries()]
    .map(([bucket, v]) => ({ bucket, ...v }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .slice(-TREND_DAYS);
  const byModel = [...models.entries()]
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.cost_usd - a.cost_usd || b.jobs - a.jobs);
  const active = [...activeByFactio.entries()]
    .map(([factio, n]) => ({ factio, active: n }))
    .sort((a, b) => a.factio.localeCompare(b.factio));
  const recentAudit = deps.audit
    ? opts.factio
      ? await deps.audit.listByFactio(opts.factio, opts.recentLimit ?? 20)
      : await deps.audit.list(opts.recentLimit ?? 20)
    : [];

  return {
    totals: { jobs: jobs.length, cost_usd: totalCost, tenants: tenants.length },
    tenants,
    recentAudit,
    costTrend,
    byModel,
    active,
  };
}
