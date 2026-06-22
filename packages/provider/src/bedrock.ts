import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock as BedrockContentBlock,
  type ConverseResponse,
  type Message as BedrockMessage,
  type StopReason as BedrockStopReason,
  type SystemContentBlock,
  type Tool as BedrockTool,
  type ToolUseBlock as BedrockToolUseBlock,
} from "@aws-sdk/client-bedrock-runtime";
import type {
  ContentBlock,
  GenerateRequest,
  Message,
  ModelProvider,
  ModelResponse,
  StopReason,
  ToolDefinition,
} from "@auriga/core";

/** The Bedrock SDK's recursive JSON-document type; tool input + schema are passed as this. */
type BedrockDocument = NonNullable<BedrockToolUseBlock["input"]>;

export interface BedrockProviderOptions {
  /** AWS region for the Bedrock runtime endpoint. Falls back to AWS_REGION, then us-east-1. */
  region?: string;
  /** Inject a pre-built client (e.g. for tests or a custom endpoint). */
  client?: BedrockRuntimeClient;
}

/**
 * Amazon Bedrock-backed ModelProvider via the Converse API. Maps the
 * provider-agnostic request/response types to and from the Bedrock SDK. Unlike
 * the other adapters there is no apiKey — credentials come from the default AWS
 * provider chain (env, shared config, SSO, or an instance role); `region` is the
 * one explicit knob.
 */
export class BedrockProvider implements ModelProvider {
  readonly name = "bedrock";
  private readonly client: BedrockRuntimeClient;

  constructor(opts: BedrockProviderOptions = {}) {
    this.client =
      opts.client ??
      new BedrockRuntimeClient({ region: opts.region ?? process.env.AWS_REGION ?? "us-east-1" });
  }

  async complete(req: GenerateRequest): Promise<ModelResponse> {
    const res = await this.client.send(
      new ConverseCommand({
        modelId: req.model,
        messages: toBedrockMessages(req.messages),
        ...(req.system !== undefined ? { system: toBedrockSystem(req.system) } : {}),
        ...(req.tools ? { toolConfig: { tools: req.tools.map(toBedrockTool) } } : {}),
        inferenceConfig: {
          maxTokens: req.max_tokens,
          ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
          ...(req.stop_sequences ? { stopSequences: req.stop_sequences } : {}),
        },
      }),
    );
    return fromBedrockResponse(res, req.model);
  }
}

// --- mapping: ours -> Bedrock -----------------------------------------------

function toBedrockMessages(messages: Message[]): BedrockMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map(toBedrockBlock),
  }));
}

function toBedrockBlock(block: ContentBlock): BedrockContentBlock {
  switch (block.type) {
    case "text":
      return { text: block.text };
    case "tool_use":
      return {
        toolUse: { toolUseId: block.id, name: block.name, input: block.input as BedrockDocument },
      };
    case "tool_result":
      return {
        toolResult: {
          toolUseId: block.tool_use_id,
          content: [{ text: block.content }],
          ...(block.is_error ? { status: "error" as const } : {}),
        },
      };
  }
}

function toBedrockSystem(system: string): SystemContentBlock[] {
  return [{ text: system }];
}

function toBedrockTool(tool: ToolDefinition): BedrockTool {
  return {
    toolSpec: {
      name: tool.name,
      description: tool.description,
      inputSchema: { json: tool.input_schema as BedrockDocument },
    },
  };
}

// --- mapping: Bedrock -> ours -----------------------------------------------

function fromBedrockResponse(res: ConverseResponse, model: string): ModelResponse {
  const content: ContentBlock[] = [];
  for (const block of res.output?.message?.content ?? []) {
    if (typeof block.text === "string") {
      content.push({ type: "text", text: block.text });
    } else if (block.toolUse) {
      content.push({
        type: "tool_use",
        id: block.toolUse.toolUseId ?? "",
        name: block.toolUse.name ?? "",
        input: (block.toolUse.input ?? {}) as Record<string, unknown>,
      });
    }
    // Other block types (reasoning, image, etc.) are ignored for now.
  }
  return {
    content,
    stop_reason: mapStopReason(res.stopReason),
    usage: {
      input_tokens: res.usage?.inputTokens ?? 0,
      output_tokens: res.usage?.outputTokens ?? 0,
    },
    model,
  };
}

function mapStopReason(reason: BedrockStopReason | undefined): StopReason {
  switch (reason) {
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    case "stop_sequence":
      return "stop_sequence";
    default:
      // end_turn, content_filtered, guardrail_intervened, malformed_*, model_context_window_exceeded
      return "end_turn";
  }
}
