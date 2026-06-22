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

/** DeepSeek model ids (OpenAI-compatible; routed via the `deepseek-` prefix). */
export const DEEPSEEK_MODELS = {
  chat: "deepseek-chat",
  reasoner: "deepseek-reasoner",
} as const;

export type DeepSeekModelHandle = keyof typeof DEEPSEEK_MODELS;

/** Aliyun Bailian / Qwen model ids (OpenAI-compatible; routed via the `qwen` prefix). */
export const QWEN_MODELS = {
  plus: "qwen-plus",
  max: "qwen-max",
  turbo: "qwen-turbo",
} as const;

export type QwenModelHandle = keyof typeof QWEN_MODELS;

/** Moonshot (Kimi) model ids (OpenAI-compatible; routed via the `kimi`/`moonshot` prefix). */
export const MOONSHOT_MODELS = {
  k2: "kimi-k2-0905-preview",
  v1_8k: "moonshot-v1-8k",
  v1_32k: "moonshot-v1-32k",
} as const;

export type MoonshotModelHandle = keyof typeof MOONSHOT_MODELS;

/** Zhipu GLM model ids (OpenAI-compatible; routed via the `glm-` prefix). */
export const ZHIPU_MODELS = {
  glm4: "glm-4",
  glm4Plus: "glm-4-plus",
} as const;

export type ZhipuModelHandle = keyof typeof ZHIPU_MODELS;
