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
  // DeepSeek — confirm against api-docs.deepseek.com/quick_start/pricing
  "deepseek-chat": { inputPerMTok: 0.27, outputPerMTok: 1.1 },
  "deepseek-reasoner": { inputPerMTok: 0.55, outputPerMTok: 2.19 },
  // Aliyun Bailian / Qwen — confirm against the DashScope model pricing page
  "qwen-plus": { inputPerMTok: 0.4, outputPerMTok: 1.2 },
  "qwen-max": { inputPerMTok: 1.6, outputPerMTok: 6.4 },
  "qwen-turbo": { inputPerMTok: 0.05, outputPerMTok: 0.2 },
  // Moonshot (Kimi) — confirm against platform.moonshot.cn pricing
  "kimi-k2-0905-preview": { inputPerMTok: 0.6, outputPerMTok: 2.5 },
  "moonshot-v1-8k": { inputPerMTok: 0.2, outputPerMTok: 0.2 },
  "moonshot-v1-32k": { inputPerMTok: 0.3, outputPerMTok: 0.3 },
  // Zhipu GLM — confirm against open.bigmodel.cn pricing
  "glm-4": { inputPerMTok: 0.6, outputPerMTok: 0.6 },
  "glm-4-plus": { inputPerMTok: 0.7, outputPerMTok: 0.7 },
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
