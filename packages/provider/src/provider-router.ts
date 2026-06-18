import type { JobSpec, ModelProvider } from "@auriga/core";

export interface RoutedExecution {
  provider: ModelProvider;
  /** Model for the planning step (reasoning sandwich). */
  planModel: string;
  /** Model for execution steps. */
  actModel: string;
}

/** Selects which backend (provider) + models a whole job runs on. */
export interface ProviderRouter {
  route(spec: JobSpec): RoutedExecution;
}

export interface Backend {
  provider: ModelProvider;
  model: string;
}

/** One backend, with an optional separate planning model (reasoning sandwich). */
export function singleProvider(
  provider: ModelProvider,
  opts: { plan?: string; act: string },
): ProviderRouter {
  return {
    route: () => ({ provider, planModel: opts.plan ?? opts.act, actModel: opts.act }),
  };
}

/**
 * Cost-aware, backend-agnostic routing: a job whose cost budget is below the
 * threshold runs on a cheap backend (possibly a different provider); otherwise a
 * strong model plans and a fast model executes on the default backend.
 */
export function costAwareRouter(opts: {
  default: { provider: ModelProvider; plan: string; act: string };
  cheap: Backend;
  cheapBelowUsd: number;
}): ProviderRouter {
  return {
    route(spec) {
      if (spec.budget.max_cost_usd < opts.cheapBelowUsd) {
        return { provider: opts.cheap.provider, planModel: opts.cheap.model, actModel: opts.cheap.model };
      }
      return {
        provider: opts.default.provider,
        planModel: opts.default.plan,
        actModel: opts.default.act,
      };
    },
  };
}
