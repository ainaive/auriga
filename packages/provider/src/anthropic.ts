import Anthropic from "@anthropic-ai/sdk";
import type {
  ContentBlock,
  GenerateRequest,
  Message,
  ModelProvider,
  ModelResponse,
  StopReason,
  ToolDefinition,
} from "@auriga/core";

export interface AnthropicProviderOptions {
  apiKey?: string;
  /** Inject a pre-built client (e.g. for tests or a custom base URL). */
  client?: Anthropic;
}

/**
 * Anthropic-backed ModelProvider. Maps the provider-agnostic request/response
 * types to and from the Anthropic SDK. This is the only place Anthropic-specific
 * shapes appear — swapping providers means writing a sibling adapter, not touching
 * the loop.
 */
export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";
  private readonly client: Anthropic;

  constructor(opts: AnthropicProviderOptions = {}) {
    this.client =
      opts.client ??
      new Anthropic({ apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async complete(req: GenerateRequest): Promise<ModelResponse> {
    const res = await this.client.messages.create({
      model: req.model,
      max_tokens: req.max_tokens,
      messages: toAnthropicMessages(req.messages),
      ...(req.system !== undefined ? { system: req.system } : {}),
      ...(req.tools ? { tools: req.tools.map(toAnthropicTool) } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.stop_sequences ? { stop_sequences: req.stop_sequences } : {}),
    });
    return fromAnthropicResponse(res);
  }

  async countTokens(req: GenerateRequest): Promise<number> {
    const res = await this.client.messages.countTokens({
      model: req.model,
      messages: toAnthropicMessages(req.messages),
      ...(req.system !== undefined ? { system: req.system } : {}),
      ...(req.tools ? { tools: req.tools.map(toAnthropicTool) } : {}),
    });
    return res.input_tokens;
  }
}

// --- mapping: ours -> Anthropic ---------------------------------------------

function toAnthropicMessages(messages: Message[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map(toAnthropicBlock),
  }));
}

function toAnthropicBlock(block: ContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case "text":
      return { type: "text", text: block.text };
    case "tool_use":
      return { type: "tool_use", id: block.id, name: block.name, input: block.input };
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: block.tool_use_id,
        content: block.content,
        ...(block.is_error !== undefined ? { is_error: block.is_error } : {}),
      };
  }
}

function toAnthropicTool(tool: ToolDefinition): Anthropic.Tool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
  };
}

// --- mapping: Anthropic -> ours ---------------------------------------------

function fromAnthropicResponse(res: Anthropic.Message): ModelResponse {
  const content: ContentBlock[] = [];
  for (const block of res.content) {
    if (block.type === "text") {
      content.push({ type: "text", text: block.text });
    } else if (block.type === "tool_use") {
      content.push({
        type: "tool_use",
        id: block.id,
        name: block.name,
        input: (block.input ?? {}) as Record<string, unknown>,
      });
    }
    // Other block types (thinking, etc.) are ignored for now.
  }
  return {
    content,
    stop_reason: mapStopReason(res.stop_reason),
    usage: {
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
    },
    model: res.model,
  };
}

function mapStopReason(reason: Anthropic.Message["stop_reason"]): StopReason {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    default:
      // end_turn, pause_turn, refusal, model_context_window_exceeded, null
      return "end_turn";
  }
}
