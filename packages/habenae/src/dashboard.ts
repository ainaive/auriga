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
}

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
  }

  const tenants = [...byFactio.values()].sort((a, b) => a.factio.localeCompare(b.factio));
  const recentAudit = deps.audit
    ? opts.factio
      ? await deps.audit.listByFactio(opts.factio, opts.recentLimit ?? 20)
      : await deps.audit.list(opts.recentLimit ?? 20)
    : [];

  return {
    totals: { jobs: jobs.length, cost_usd: totalCost, tenants: tenants.length },
    tenants,
    recentAudit,
  };
}
