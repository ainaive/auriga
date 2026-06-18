import type { Usage } from "@auriga/core";

/**
 * Cost accounting (precursor to the full Capella observability layer). Make cost
 * observable from day one — token spend can quietly multiply when an agent loops.
 *
 * Prices are USD per 1M tokens (approximate list prices; treat as configurable).
 */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-8": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
};

/** Returns NaN for an unpriced model so callers can distinguish "free" from "unknown". */
export function estimateCostUsd(model: string, usage: Usage): number {
  const pricing = PRICING[model];
  if (!pricing) return Number.NaN;
  return (
    (usage.input_tokens * pricing.inputPerMTok + usage.output_tokens * pricing.outputPerMTok) /
    1_000_000
  );
}

export function formatUsage(model: string | null, usage: Usage): string {
  const cost = model ? estimateCostUsd(model, usage) : Number.NaN;
  const costStr = Number.isFinite(cost) ? ` · ~$${cost.toFixed(4)}` : " · cost n/a";
  return `tokens in=${usage.input_tokens} out=${usage.output_tokens}${costStr}`;
}
