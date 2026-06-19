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

export interface ConfigFormState {
  global: string;
  perFactio: string;
  policies: PolicyDraft[];
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

  if (Object.keys(errors).length > 0) return { errors };
  return { config: { policies, quotas: { global, perFactio } }, errors: {} };
}
