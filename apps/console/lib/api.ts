// Decoupled HTTP client for the Auriga control-plane API (apps/api). The console
// is a thin read-side surface; it defines its own response types rather than
// importing the Bun/server packages.

export const BASE = process.env.NEXT_PUBLIC_AURIGA_API ?? "http://localhost:8787";
const FACTIO = process.env.AURIGA_FACTIO ?? "default";
const ROLE = process.env.AURIGA_ROLE ?? "viewer";

// Sent on tenant-scoped calls. Set server-side (never reaches the browser); the
// write actions in lib/actions.ts reuse these so there's one source of truth.
export const authHeaders: Record<string, string> = {
  "x-auriga-factio": FACTIO,
  "x-auriga-role": ROLE,
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface TenantSummary {
  factio: string;
  total: number;
  byState: Record<string, number>;
  cost_usd: number;
}

export interface Dashboard {
  totals: { jobs: number; tenants: number; cost_usd: number };
  tenants: TenantSummary[];
  recentAudit: { id: string; ts: string; factio: string; action: string; job_id: string | null }[];
}

export interface Job {
  id: string;
  spec: { factio: string; goal: string; require_approval?: boolean };
  state: string;
  reason: string | null;
  model: string | null;
  approved: boolean;
  attempts: number;
  steps: number;
  usage: Usage;
}

export interface TraceEvent {
  type: string;
  [key: string]: unknown;
}

export interface Trace {
  job_id: string;
  model: string;
  events: TraceEvent[];
  result: { state: string; reason: string };
}

export interface Skill {
  name: string;
  version: string;
  description: string;
  type: string;
  stats: { uses: number; successes: number; total_cost_usd: number };
}

async function get<T>(path: string, withAuth = false): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      cache: "no-store",
      headers: withAuth ? authHeaders : undefined,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const api = {
  dashboard: () => get<Dashboard>("/dashboard"),
  jobs: () => get<Job[]>("/jobs", true),
  job: (id: string) => get<Job>(`/jobs/${encodeURIComponent(id)}`, true),
  trace: (id: string) => get<Trace>(`/jobs/${encodeURIComponent(id)}/trace`, true),
  skills: () => get<Skill[]>("/skills"),
};
