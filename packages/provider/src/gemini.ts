import {
  FinishReason,
  GoogleGenAI,
  type Content,
  type GenerateContentConfig,
  type GenerateContentResponse,
  type Part,
  type Schema,
} from "@google/genai";
import {
  newId,
  type ContentBlock,
  type GenerateRequest,
  type Message,
  type ModelProvider,
  type ModelResponse,
  type StopReason,
  type ToolDefinition,
} from "@auriga/core";

export interface GeminiProviderOptions {
  apiKey?: string;
  /** Inject a pre-built client (e.g. for tests). */
  client?: GoogleGenAI;
}

/**
 * Gemini-backed ModelProvider via `@google/genai`. Maps the provider-agnostic
 * request/response types to and from Gemini's `contents`/`parts` shape. Two
 * quirks are handled here: the assistant role is named `model`, and Gemini keys
 * function responses by tool *name* (not id) and returns no id on function
 * calls — so we synthesize ids and recover names from the prior turn.
 */
export class GeminiProvider implements ModelProvider {
  readonly name = "gemini";
  private readonly client: GoogleGenAI;

  constructor(opts: GeminiProviderOptions = {}) {
    this.client =
      opts.client ??
      new GoogleGenAI({
        apiKey: opts.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
      });
  }

  async complete(req: GenerateRequest): Promise<ModelResponse> {
    const res = await this.client.models.generateContent({
      model: req.model,
      contents: toGeminiContents(req.messages),
      config: toGeminiConfig(req),
    });
    return fromGeminiResponse(res, req.model);
  }

  async countTokens(req: GenerateRequest): Promise<number> {
    const res = await this.client.models.countTokens({
      model: req.model,
      contents: toGeminiContents(req.messages),
    });
    return res.totalTokens ?? 0;
  }
}

// --- mapping: ours -> Gemini ------------------------------------------------

function toGeminiConfig(req: GenerateRequest): GenerateContentConfig {
  return {
    maxOutputTokens: req.max_tokens,
    ...(req.system !== undefined ? { systemInstruction: req.system } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.stop_sequences ? { stopSequences: req.stop_sequences } : {}),
    ...(req.tools
      ? { tools: [{ functionDeclarations: req.tools.map(toGeminiFunctionDeclaration) }] }
      : {}),
  };
}

function toGeminiContents(messages: Message[]): Content[] {
  // Gemini has no tool-call id, so recover a tool_result's function name from the
  // id the assistant turn requested it under.
  const nameById = new Map<string, string>();
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === "tool_use") nameById.set(b.id, b.name);
    }
  }
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: m.content.map((b) => toGeminiPart(b, nameById)),
  }));
}

function toGeminiPart(block: ContentBlock, nameById: Map<string, string>): Part {
  switch (block.type) {
    case "text":
      return { text: block.text };
    case "tool_use":
      return { functionCall: { name: block.name, args: block.input } };
    case "tool_result": {
      const name = nameById.get(block.tool_use_id) ?? block.tool_use_id;
      return {
        functionResponse: {
          name,
          response: block.is_error ? { error: block.content } : { result: block.content },
        },
      };
    }
  }
}

function toGeminiFunctionDeclaration(tool: ToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: sanitizeGeminiSchema(tool.input_schema) as Schema,
  };
}

/**
 * Gemini's Schema type rejects several JSON-Schema keywords that tools commonly
 * carry (e.g. from zod-to-json-schema). Deep-clone and strip the unsupported
 * ones so a standard JSON Schema is accepted.
 */
export function sanitizeGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const STRIP = new Set([
    "$schema",
    "$ref",
    "$defs",
    "definitions",
    "additionalProperties",
    "const",
  ]);
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (STRIP.has(k)) continue;
        out[k] = clean(v);
      }
      return out;
    }
    return value;
  };
  return clean(schema) as Record<string, unknown>;
}

// --- mapping: Gemini -> ours ------------------------------------------------

function fromGeminiResponse(res: GenerateContentResponse, model: string): ModelResponse {
  const parts = res.candidates?.[0]?.content?.parts ?? [];
  const content: ContentBlock[] = [];
  for (const part of parts) {
    if (typeof part.text === "string" && part.text.length > 0) {
      content.push({ type: "text", text: part.text });
    } else if (part.functionCall) {
      content.push({
        type: "tool_use",
        // Gemini returns no call id — synthesize one so it round-trips as the result key.
        id: part.functionCall.id ?? newId("toolu"),
        name: part.functionCall.name ?? "",
        input: part.functionCall.args ?? {},
      });
    }
  }
  // Gemini reports finishReason STOP even when it emits a function call, so infer
  // tool_use from the parts rather than the finish reason.
  const hasToolUse = content.some((b) => b.type === "tool_use");
  const usage = res.usageMetadata;
  return {
    content,
    stop_reason: hasToolUse ? "tool_use" : mapFinishReason(res.candidates?.[0]?.finishReason),
    usage: {
      input_tokens: usage?.promptTokenCount ?? 0,
      output_tokens: usage?.candidatesTokenCount ?? 0,
    },
    model,
  };
}

function mapFinishReason(reason: FinishReason | undefined): StopReason {
  switch (reason) {
    case FinishReason.MAX_TOKENS:
      return "max_tokens";
    default:
      // STOP, SAFETY, RECITATION, BLOCKLIST, OTHER, etc.
      return "end_turn";
  }
}
