/**
 * @auriga/provider — model provider implementations behind the swappable
 * ModelProvider seam defined in @auriga/core.
 */
export { AnthropicProvider, type AnthropicProviderOptions } from "./anthropic";
export { StubProvider } from "./stub";
export { MODELS, type ModelHandle } from "./models";
