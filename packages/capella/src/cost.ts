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
  // Anthropic (direct)
  "claude-opus-4-8": { inputPerMTok: 15, outputPerMTok: 75 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1, outputPerMTok: 5 },
  // OpenAI — confirm against platform.openai.com/pricing
  "gpt-4o": { inputPerMTok: 2.5, outputPerMTok: 10 },
  "gpt-4o-mini": { inputPerMTok: 0.15, outputPerMTok: 0.6 },
  o3: { inputPerMTok: 10, outputPerMTok: 40 },
  // Gemini — confirm against ai.google.dev/pricing
  "gemini-2.5-pro": { inputPerMTok: 1.25, outputPerMTok: 10 },
  "gemini-2.5-flash": { inputPerMTok: 0.3, outputPerMTok: 2.5 },
  // Bedrock (Anthropic on Bedrock) — confirm against AWS Bedrock pricing. The
  // Converse modelId includes the cross-region prefix, so list both the bare and
  // us.-prefixed inference-profile ids (estimateCostUsd does an exact-key lookup).
  "anthropic.claude-3-5-sonnet-20241022-v2:0": { inputPerMTok: 6, outputPerMTok: 30 },
  "us.anthropic.claude-3-5-sonnet-20241022-v2:0": { inputPerMTok: 6, outputPerMTok: 30 },
  "anthropic.claude-3-5-haiku-20241022-v1:0": { inputPerMTok: 0.8, outputPerMTok: 4 },
  "us.anthropic.claude-3-5-haiku-20241022-v1:0": { inputPerMTok: 0.8, outputPerMTok: 4 },
  // DeepSeek — api-docs.deepseek.com/quick_start/pricing. `deepseek-chat`/`deepseek-reasoner`
  // are aliases for deepseek-v4-flash (non-thinking/thinking) and deprecate 2026-07-24.
  "deepseek-chat": { inputPerMTok: 0.14, outputPerMTok: 0.28 },
  "deepseek-reasoner": { inputPerMTok: 0.14, outputPerMTok: 0.28 },
  "deepseek-v4-flash": { inputPerMTok: 0.14, outputPerMTok: 0.28 },
  "deepseek-v4-pro": { inputPerMTok: 0.435, outputPerMTok: 0.87 },
  // Aliyun Bailian / Qwen — Alibaba Model Studio international (Singapore) endpoint.
  "qwen-plus": { inputPerMTok: 0.4, outputPerMTok: 2.4 },
  "qwen-max": { inputPerMTok: 1.2, outputPerMTok: 6 },
  "qwen-turbo": { inputPerMTok: 0.05, outputPerMTok: 0.2 },
  // Moonshot (Kimi) — platform.kimi.ai. moonshot-v1-* and the legacy K2 snapshot are retired;
  // current models are K2.5 / K2.6 (input is cache-miss).
  "kimi-k2.5": { inputPerMTok: 0.6, outputPerMTok: 3 },
  "kimi-k2.6": { inputPerMTok: 0.95, outputPerMTok: 4 },
  // Zhipu GLM — docs.z.ai. glm-4/glm-4-plus are superseded by the GLM-4.7 family.
  "glm-4.7": { inputPerMTok: 0.6, outputPerMTok: 2.2 },
  "glm-4.7-flashx": { inputPerMTok: 0.07, outputPerMTok: 0.4 },
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
