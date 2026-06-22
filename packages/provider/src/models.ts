/** Convenience handles for the current Claude model ids. */
export const MODELS = {
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
} as const;

export type ModelHandle = keyof typeof MODELS;

/** Convenience handles for OpenAI model ids (routed via the `gpt-*`/`o*` prefix). */
export const OPENAI_MODELS = {
  gpt4o: "gpt-4o",
  gpt4oMini: "gpt-4o-mini",
  o3: "o3",
} as const;

export type OpenAIModelHandle = keyof typeof OPENAI_MODELS;

/** Convenience handles for Gemini model ids (routed via the `gemini-*` prefix). */
export const GEMINI_MODELS = {
  pro: "gemini-2.5-pro",
  flash: "gemini-2.5-flash",
} as const;

export type GeminiModelHandle = keyof typeof GEMINI_MODELS;

/**
 * Convenience handles for Bedrock model ids (routed via the vendor-prefixed id,
 * e.g. `us.anthropic.*`). These are cross-region inference-profile ids.
 */
export const BEDROCK_MODELS = {
  claudeSonnet: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
  claudeHaiku: "us.anthropic.claude-3-5-haiku-20241022-v1:0",
} as const;

export type BedrockModelHandle = keyof typeof BEDROCK_MODELS;
