import type { JobSpec } from "@auriga/core";

export interface RoutedModels {
  /** Model for the planning / first step of each attempt (typically stronger). */
  plan: string;
  /** Model for execution steps (can be cheaper / faster). */
  act: string;
}

/** Selects which model(s) a job runs on. The control plane consults this per job. */
export interface ModelRouter {
  route(spec: JobSpec): RoutedModels;
}

/** Use one model for everything. */
export function staticRouter(model: string): ModelRouter {
  return { route: () => ({ plan: model, act: model }) };
}

/**
 * The "reasoning sandwich": a strong model plans (the first step of each attempt),
 * a fast/cheap model carries out the execution steps. Verification is deterministic,
 * so the sandwich here is strong-plan + fast-act.
 */
export function reasoningSandwich(strong: string, fast: string): ModelRouter {
  return { route: () => ({ plan: strong, act: fast }) };
}
