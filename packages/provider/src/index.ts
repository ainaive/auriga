/**
 * @auriga/provider — model provider implementations behind the swappable
 * ModelProvider seam defined in @auriga/core.
 */
export { AnthropicProvider, type AnthropicProviderOptions } from "./anthropic";
export { BedrockProvider, type BedrockProviderOptions } from "./bedrock";
export { GeminiProvider, type GeminiProviderOptions, sanitizeGeminiSchema } from "./gemini";
export { OpenAIProvider, type OpenAIProviderOptions } from "./openai";
export {
  providerFor,
  providerKindFor,
  hasCredentials,
  credentialEnvFor,
  type ProviderName,
} from "./factory";
export { StubProvider } from "./stub";
export {
  MODELS,
  type ModelHandle,
  OPENAI_MODELS,
  type OpenAIModelHandle,
  GEMINI_MODELS,
  type GeminiModelHandle,
  BEDROCK_MODELS,
  type BedrockModelHandle,
  DEEPSEEK_MODELS,
  type DeepSeekModelHandle,
  QWEN_MODELS,
  type QwenModelHandle,
  MOONSHOT_MODELS,
  type MoonshotModelHandle,
  ZHIPU_MODELS,
  type ZhipuModelHandle,
} from "./models";
export {
  staticRouter,
  reasoningSandwich,
  type ModelRouter,
  type RoutedModels,
} from "./router";
export {
  singleProvider,
  costAwareRouter,
  type ProviderRouter,
  type RoutedExecution,
  type Backend,
} from "./provider-router";
