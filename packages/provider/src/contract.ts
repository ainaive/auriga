import { userText, validateModelResponse, type ModelProvider } from "@auriga/core";

/**
 * Reusable provider contract: complete() must return a structurally valid
 * ModelResponse. Used by both the stub (deterministic) and live providers so any
 * new backend can be checked against the same bar. Throws on violation.
 */
export async function runCompletionContract(provider: ModelProvider, model: string): Promise<void> {
  const res = await provider.complete({
    model,
    max_tokens: 64,
    messages: [userText("ping")],
  });
  validateModelResponse(res);
}
