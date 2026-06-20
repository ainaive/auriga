// Decoupled HTTP client for the Auriga control-plane API (apps/api). The console
// is a thin read-side surface; it defines its own response types rather than
// importing the Bun/server packages.

import { getActor } from "./session";
import type { JobState, TraceEvent, Usage } from "./types";

export type { JobState, TraceEvent, Usage } from "./types";

export const BASE = process.env.NEXT_PUBLIC_AURIGA_API ?? "http://localhost:8787";

// Headers for tenant-scoped calls, derived from the session cookie (falling back to the
// env identity). Built server-side per request; never reaches the browser. The write
// actions in lib/actions.ts reuse this so there's one source of truth.
export async function authHeaders(): Promise<Record<string, string>> {
  const actor = await getActor();
  return { "x-auriga-factio": actor.factio, "x-auriga-role": actor.role };
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
  state: JobState;
  reason: string | null;
  model: string | null;
  approved: boolean;
  attempts: number;
  steps: number;
  usage: Usage;
}

export interface Trace {
  job_id: string;
  model: string;
  events: TraceEvent[];
  result: { state: string; reason: string };
}

export interface WorkspaceEntry {
  path: string;
  bytes: number;
}

export interface WorkspaceManifest {
  job_id: string;
  files: WorkspaceEntry[];
}

export interface WorkspaceFile {
  path: string;
  bytes: number;
  truncated: boolean;
  encoding: "utf8" | "base64";
  content: string;
}

export interface Skill {
  name: string;
  version: string;
  description: string;
  type: string;
  stats: { uses: number; successes: number; total_cost_usd: number };
}

export interface FactioPolicy {
  factio: string;
  roles: string[];
  allowed_tools?: string[];
  allowed_skills?: string[];
}

export interface AurigaConfig {
  policies: FactioPolicy[];
  quotas: { global: number; perFactio: number };
}

async function get<T>(path: string, withAuth = false): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`, {
      cache: "no-store",
      headers: withAuth ? await authHeaders() : undefined,
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
  workspace: (id: string) =>
    get<WorkspaceManifest>(`/jobs/${encodeURIComponent(id)}/workspace`, true),
  skills: () => get<Skill[]>("/skills"),
  config: () => get<AurigaConfig>("/config"),
};
