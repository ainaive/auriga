import { ValidationError, type ModelProvider } from "@auriga/core";
import { AnthropicProvider } from "./anthropic";
import { BedrockProvider } from "./bedrock";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import {
  OPENAI_COMPATIBLE,
  firstPresentEnv,
  type CompatibleBackend,
  type CompatibleKind,
} from "./openai-compatible";

/** Backends with their own native SDK adapter (not OpenAI-compatible). */
type NativeKind = "anthropic" | "gemini" | "bedrock";
export type ProviderName = NativeKind | CompatibleKind;

function isProviderName(s: string): s is ProviderName {
  return s === "anthropic" || s === "gemini" || s === "bedrock" || s in OPENAI_COMPATIBLE;
}

/** Infer the backend from a model id by its prefix (no `vendor/` override handling). */
function inferKind(modelId: string): ProviderName {
  // Bedrock: cross-region inference profiles and vendor-namespaced (dotted) ids.
  if (/^(us|eu|apac)\.[a-z]/.test(modelId)) return "bedrock";
  if (/^(anthropic|amazon|meta|mistral|cohere|ai21|deepseek)\./.test(modelId)) return "bedrock";
  if (/^claude-/.test(modelId)) return "anthropic";
  if (/^gemini-/.test(modelId)) return "gemini";
  // OpenAI-compatible gateways (openai, deepseek, bailian, moonshot, zhipu, …).
  for (const [kind, entry] of Object.entries(OPENAI_COMPATIBLE)) {
    if (entry.prefixes.some((re) => re.test(modelId))) return kind as CompatibleKind;
  }
  throw new ValidationError(`unknown model id: ${modelId} — no provider matches its prefix`);
}

/**
 * Resolve a model id to its backend kind and the actual model string to send.
 * An explicit `vendor/model` prefix (where `vendor` is a known backend) forces
 * the backend and is stripped from the returned model — useful when the same
 * model is served by multiple gateways (e.g. `bailian/deepseek-r1`). Otherwise
 * the backend is inferred from the prefix.
 */
export function resolveModel(modelId: string): { kind: ProviderName; model: string } {
  const slash = modelId.indexOf("/");
  if (slash > 0) {
    const prefix = modelId.slice(0, slash);
    if (isProviderName(prefix)) return { kind: prefix, model: modelId.slice(slash + 1) };
  }
  return { kind: inferKind(modelId), model: modelId };
}

/** The backend a model id resolves to (honoring a `vendor/` override). */
export function providerKindFor(modelId: string): ProviderName {
  return resolveModel(modelId).kind;
}

function construct(kind: ProviderName): ModelProvider {
  switch (kind) {
    case "anthropic":
      return new AnthropicProvider();
    case "gemini":
      return new GeminiProvider();
    case "bedrock":
      return new BedrockProvider();
    default: {
      // OpenAI-compatible: same adapter, different base URL + credentials + token field.
      const entry: CompatibleBackend = OPENAI_COMPATIBLE[kind];
      const baseURL =
        (entry.baseURLEnv ? process.env[entry.baseURLEnv] : undefined) ?? entry.baseURL;
      return new OpenAIProvider({
        name: kind,
        ...(baseURL !== undefined ? { baseURL } : {}),
        apiKey: firstPresentEnv(entry.apiKeyEnv),
        maxTokensField: entry.maxTokensField,
      });
    }
  }
}

const singletons = new Map<ProviderName, ModelProvider>();

/**
 * Resolve a ModelProvider for a model id, inferring and caching the backend.
 * Constructors read their own credentials from the environment; call sites gate
 * on {@link hasCredentials} to answer 503 before construction. Pass `opts.cache`
 * to isolate instances (e.g. in tests).
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
    case "gemini":
      return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    case "bedrock":
      // The AWS SDK resolves credentials lazily from its full default chain (env vars,
      // SSO, web identity, shared config, ECS/EKS container creds, EC2 IMDS) at request
      // time, and BedrockRuntimeClient construction never throws. We can't preflight that
      // synchronously without rejecting valid setups (e.g. an EC2/EKS instance role), so
      // defer to the SDK — a real auth failure surfaces on the first Converse call.
      return true;
    default:
      return Boolean(firstPresentEnv(OPENAI_COMPATIBLE[kind].apiKeyEnv));
  }
}

/** The env var(s) a backend reads its credentials from — for actionable error messages. */
export function credentialEnvFor(kind: ProviderName): string {
  switch (kind) {
    case "anthropic":
      return "ANTHROPIC_API_KEY";
    case "gemini":
      return "GEMINI_API_KEY (or GOOGLE_API_KEY)";
    case "bedrock":
      return "AWS credentials (AWS_ACCESS_KEY_ID / AWS_PROFILE)";
    default:
      return OPENAI_COMPATIBLE[kind].apiKeyEnv.join(" / ");
  }
}
