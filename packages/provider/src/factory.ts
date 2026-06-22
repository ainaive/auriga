import { ValidationError, type ModelProvider } from "@auriga/core";
import { AnthropicProvider } from "./anthropic";
import { BedrockProvider } from "./bedrock";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";

export type ProviderName = "anthropic" | "openai" | "gemini" | "bedrock";

/**
 * Infer the backend from a model id by its prefix. The job's `model` string is
 * the only selector — no JobSpec change. Bedrock vendor-prefixed ids (e.g.
 * `us.anthropic.*`, `meta.*`) are matched before the bare `claude-*` rule so a
 * Bedrock-hosted Claude doesn't resolve to the direct Anthropic backend.
 */
export function providerKindFor(modelId: string): ProviderName {
  // Bedrock: cross-region inference profiles and vendor-namespaced ids.
  if (/^(us|eu|apac)\.[a-z]/.test(modelId)) return "bedrock";
  if (/^(anthropic|amazon|meta|mistral|cohere|ai21|deepseek)\./.test(modelId)) return "bedrock";
  if (/^claude-/.test(modelId)) return "anthropic";
  if (/^(gpt-|o1|o3|o4|chatgpt)/.test(modelId)) return "openai";
  if (/^gemini-/.test(modelId)) return "gemini";
  throw new ValidationError(`unknown model id: ${modelId} — no provider matches its prefix`);
}

function construct(kind: ProviderName): ModelProvider {
  switch (kind) {
    case "anthropic":
      return new AnthropicProvider();
    case "openai":
      return new OpenAIProvider();
    case "gemini":
      return new GeminiProvider();
    case "bedrock":
      return new BedrockProvider();
  }
}

const singletons = new Map<ProviderName, ModelProvider>();

/**
 * Resolve a ModelProvider for a model id, inferring and caching the backend.
 * Constructors read their own credentials from the environment and don't throw
 * on a missing key — call sites gate on {@link hasCredentials} to answer 503.
 * Pass `opts.cache` to isolate instances (e.g. in tests).
 */
export function providerFor(
  modelId: string,
  opts: { cache?: Map<ProviderName, ModelProvider> } = {},
): ModelProvider {
  const kind = providerKindFor(modelId);
  const cache = opts.cache ?? singletons;
  const existing = cache.get(kind);
  if (existing) return existing;
  const provider = construct(kind);
  cache.set(kind, provider);
  return provider;
}

/** Whether the credentials a backend needs are present in the environment. */
export function hasCredentials(kind: ProviderName): boolean {
  switch (kind) {
    case "anthropic":
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY);
    case "gemini":
      return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    case "bedrock":
      // The AWS SDK resolves credentials lazily from its full default chain (env vars,
      // SSO, web identity, shared config, ECS/EKS container creds, EC2 IMDS) at request
      // time, and BedrockRuntimeClient construction never throws. We can't preflight that
      // synchronously without rejecting valid setups (e.g. an EC2/EKS instance role), so
      // defer to the SDK — a real auth failure surfaces on the first Converse call.
      return true;
  }
}

/** The env var(s) a backend reads its credentials from — for actionable error messages. */
export function credentialEnvFor(kind: ProviderName): string {
  switch (kind) {
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "openai":
      return "OPENAI_API_KEY";
    case "gemini":
      return "GEMINI_API_KEY (or GOOGLE_API_KEY)";
    case "bedrock":
      return "AWS credentials (AWS_ACCESS_KEY_ID / AWS_PROFILE)";
  }
}
