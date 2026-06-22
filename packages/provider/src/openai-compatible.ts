/**
 * Registry of OpenAI-compatible backends. Each one is served by the same
 * {@link OpenAIProvider} (Chat Completions wire format) pointed at a different
 * base URL + API key — so adding a vendor is a one-line entry here, not a new
 * SDK adapter. The model-id prefixes drive {@link providerKindFor}.
 */
export interface CompatibleBackend {
  label: string;
  /** Base URL for the gateway; undefined uses the canonical OpenAI endpoint. */
  baseURL?: string;
  /** Optional env var that overrides `baseURL` (e.g. region or self-hosted proxy). */
  baseURLEnv?: string;
  /** Credential env vars, in priority order — the first one present is used. */
  apiKeyEnv: string[];
  /** Model-id prefixes routed to this backend. */
  prefixes: RegExp[];
  /** Output-token-limit field this gateway understands. */
  maxTokensField: "max_completion_tokens" | "max_tokens";
}

export const OPENAI_COMPATIBLE = {
  openai: {
    label: "OpenAI",
    apiKeyEnv: ["OPENAI_API_KEY"],
    prefixes: [/^gpt-/, /^o1/, /^o3/, /^o4/, /^chatgpt/],
    maxTokensField: "max_completion_tokens",
  },
  deepseek: {
    label: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    baseURLEnv: "DEEPSEEK_BASE_URL",
    apiKeyEnv: ["DEEPSEEK_API_KEY"],
    prefixes: [/^deepseek-/],
    maxTokensField: "max_tokens",
  },
  bailian: {
    label: "Aliyun Bailian",
    // Mainland endpoint; set DASHSCOPE_BASE_URL to the dashscope-intl host for international.
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    baseURLEnv: "DASHSCOPE_BASE_URL",
    apiKeyEnv: ["DASHSCOPE_API_KEY"],
    prefixes: [/^qwen/, /^qwq/, /^qvq/],
    maxTokensField: "max_tokens",
  },
  moonshot: {
    label: "Moonshot",
    baseURL: "https://api.moonshot.cn/v1",
    baseURLEnv: "MOONSHOT_BASE_URL",
    apiKeyEnv: ["MOONSHOT_API_KEY"],
    prefixes: [/^kimi/, /^moonshot/],
    maxTokensField: "max_tokens",
  },
  zhipu: {
    label: "Zhipu GLM",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    baseURLEnv: "ZHIPU_BASE_URL",
    apiKeyEnv: ["ZHIPU_API_KEY", "GLM_API_KEY"],
    prefixes: [/^glm-/],
    maxTokensField: "max_tokens",
  },
} as const satisfies Record<string, CompatibleBackend>;

export type CompatibleKind = keyof typeof OPENAI_COMPATIBLE;

/** The first present credential env var for a backend, or undefined. */
export function firstPresentEnv(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    if (process.env[key]) return process.env[key];
  }
  return undefined;
}
