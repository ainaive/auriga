// Pure assembly + validation for the governance config form (RBAC policies +
// scheduler quotas). React-free so it is unit-testable; the control-plane PUT
// /config re-validates against the real ConfigSchema.

import type { AurigaConfig } from "@/lib/api";
import { csv } from "@/lib/job-form";

export interface PolicyDraft {
  factio: string;
  roles: string;
  allowedTools: string;
  allowedSkills: string;
}

/**
 * The backends shown in the provider-credentials section. Data-only (no SDK import) so
 * the console bundle stays lean. Keep in sync with the provider registry / factory.
 */
export interface ProviderCatalogEntry {
  kind: string;
  label: string;
  /** Env var(s) the backend reads as a fallback — shown as a hint. */
  env: string;
  supportsBaseUrl: boolean;
  /** Bedrock has no single key — credentials come from the AWS chain (env only). */
  readOnly?: boolean;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  { kind: "anthropic", label: "Anthropic", env: "ANTHROPIC_API_KEY", supportsBaseUrl: false },
  { kind: "openai", label: "OpenAI", env: "OPENAI_API_KEY", supportsBaseUrl: false },
  { kind: "gemini", label: "Gemini", env: "GEMINI_API_KEY / GOOGLE_API_KEY", supportsBaseUrl: false },
  {
    kind: "bedrock",
    label: "Bedrock",
    env: "AWS credential chain",
    supportsBaseUrl: false,
    readOnly: true,
  },
  { kind: "deepseek", label: "DeepSeek", env: "DEEPSEEK_API_KEY", supportsBaseUrl: true },
  { kind: "bailian", label: "Aliyun Bailian (Qwen)", env: "DASHSCOPE_API_KEY", supportsBaseUrl: true },
  { kind: "moonshot", label: "Moonshot (Kimi)", env: "MOONSHOT_API_KEY", supportsBaseUrl: true },
  { kind: "zhipu", label: "Zhipu GLM", env: "ZHIPU_API_KEY / GLM_API_KEY", supportsBaseUrl: true },
];

export interface ProviderDraft {
  kind: string;
  /** Whether a key is already stored (from the redacted GET) — never the key itself. */
  configured: boolean;
  /** A newly-typed key; blank means "keep the stored key". */
  apiKey: string;
  baseURL: string;
  /** Explicit revoke: send `apiKey: ""` (+ baseURL) to clear the stored credential. */
  clear?: boolean;
}

export interface ConfigFormState {
  global: string;
  perFactio: string;
  policies: PolicyDraft[];
  providers: ProviderDraft[];
}

export function configToForm(cfg: AurigaConfig): ConfigFormState {
  return {
    global: String(cfg.quotas.global),
    perFactio: String(cfg.quotas.perFactio),
    policies: cfg.policies.map((p) => ({
      factio: p.factio,
      roles: (p.roles ?? []).join(", "),
      allowedTools: (p.allowed_tools ?? []).join(", "),
      allowedSkills: (p.allowed_skills ?? []).join(", "),
    })),
    providers: PROVIDER_CATALOG.map((entry) => ({
      kind: entry.kind,
      configured: cfg.providers?.[entry.kind]?.configured ?? false,
      apiKey: "", // the key is never sent to the client
      baseURL: cfg.providers?.[entry.kind]?.baseURL ?? "",
    })),
  };
}

export function emptyPolicy(): PolicyDraft {
  return { factio: "", roles: "", allowedTools: "", allowedSkills: "" };
}

export interface ConfigBuildResult {
  config?: Record<string, unknown>;
  errors: Record<string, string>;
}

function positiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Assemble + validate an AurigaConfig-shaped object from the form. */
export function buildConfig(form: ConfigFormState): ConfigBuildResult {
  const errors: Record<string, string> = {};

  const global = positiveInt(form.global);
  const perFactio = positiveInt(form.perFactio);
  if (global === null) errors.global = "must be a positive integer";
  if (perFactio === null) errors.perFactio = "must be a positive integer";

  const policies = form.policies.map((p, i) => {
    if (!p.factio.trim()) errors[`policy.${i}`] = "factio is required";
    const roles = csv(p.roles);
    if (roles.length === 0) errors[`policy.${i}`] = "at least one role is required";
    const policy: Record<string, unknown> = { factio: p.factio.trim(), roles };
    const tools = csv(p.allowedTools);
    const skills = csv(p.allowedSkills);
    if (tools.length) policy.allowed_tools = tools;
    if (skills.length) policy.allowed_skills = skills;
    return policy;
  });

  // Provider credentials. The server merges: omitted field ⇒ keep, "" ⇒ clear, value ⇒
  // replace. So a typed apiKey replaces and a blank one keeps; an explicit "clear" sends
  // "" to revoke. baseURL is non-secret and round-trips via the redacted GET. Read-only
  // (Bedrock) and untouched/unconfigured rows are omitted (the server preserves them).
  const byKind = new Map(PROVIDER_CATALOG.map((c) => [c.kind, c]));
  const providers: Record<string, { apiKey?: string; baseURL?: string }> = {};
  for (const d of form.providers) {
    const meta = byKind.get(d.kind);
    if (meta?.readOnly) continue;
    const apiKey = d.apiKey.trim();
    const baseURL = d.baseURL.trim();
    if (!d.configured && !apiKey && !baseURL && !d.clear) continue; // nothing to send
    const entry: { apiKey?: string; baseURL?: string } = {};
    if (d.clear) {
      entry.apiKey = ""; // explicit revoke
      if (meta?.supportsBaseUrl) entry.baseURL = "";
    } else {
      if (apiKey) entry.apiKey = apiKey; // typed → replace; omitted → server keeps
      if (baseURL) entry.baseURL = baseURL;
    }
    providers[d.kind] = entry;
  }

  if (Object.keys(errors).length > 0) return { errors };
  const config: Record<string, unknown> = { policies, quotas: { global, perFactio } };
  if (Object.keys(providers).length) config.providers = providers;
  return { config, errors: {} };
}
