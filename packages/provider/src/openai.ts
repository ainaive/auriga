import OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type {
  ContentBlock,
  GenerateRequest,
  Message,
  ModelProvider,
  ModelResponse,
  StopReason,
  ToolDefinition,
} from "@auriga/core";

export interface OpenAIProviderOptions {
  apiKey?: string;
  /** Override the base URL (e.g. for Azure OpenAI or an OpenAI-compatible gateway). */
  baseURL?: string;
  /** Provider name for traces/cost (e.g. "deepseek"). Defaults to "openai". */
  name?: string;
  /**
   * Which field carries the output-token limit. OpenAI's o-series rejects
   * `max_tokens`, so the default is `max_completion_tokens`; most OpenAI-compatible
   * gateways only implement the older `max_tokens`.
   */
  maxTokensField?: "max_completion_tokens" | "max_tokens";
  /** Inject a pre-built client (e.g. for tests). */
  client?: OpenAI;
}

/**
 * OpenAI-backed ModelProvider over the Chat Completions API. Maps the
 * provider-agnostic, block-structured request/response types to and from
 * OpenAI's role-flat message format. This is the only place OpenAI-specific
 * shapes appear — the loop is untouched. The same adapter backs OpenAI-compatible
 * gateways (DeepSeek, Bailian, …) via `baseURL` + `name` + `maxTokensField`.
 */
export class OpenAIProvider implements ModelProvider {
  readonly name: string;
  private readonly client: OpenAI;
  private readonly maxTokensField: "max_completion_tokens" | "max_tokens";

  constructor(opts: OpenAIProviderOptions = {}) {
    this.name = opts.name ?? "openai";
    this.maxTokensField = opts.maxTokensField ?? "max_completion_tokens";
    this.client =
      opts.client ??
      new OpenAI({
        apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY,
        ...(opts.baseURL !== undefined ? { baseURL: opts.baseURL } : {}),
      });
  }

  async complete(req: GenerateRequest): Promise<ModelResponse> {
    const res = await this.client.chat.completions.create({
      model: req.model,
      // Compatible gateways only know `max_tokens`; OpenAI's o-series needs `max_completion_tokens`.
      ...(this.maxTokensField === "max_tokens"
        ? { max_tokens: req.max_tokens }
        : { max_completion_tokens: req.max_tokens }),
      messages: toOpenAIMessages(req),
      ...(req.tools ? { tools: req.tools.map(toOpenAITool) } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.stop_sequences ? { stop: req.stop_sequences } : {}),
    });
    return fromOpenAIResponse(res, req.model);
  }
}

// --- mapping: ours -> OpenAI ------------------------------------------------

function toOpenAIMessages(req: GenerateRequest): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];
  if (req.system !== undefined) out.push({ role: "system", content: req.system });
  for (const m of req.messages) {
    if (m.role === "assistant") {
      out.push(toOpenAIAssistant(m));
      continue;
    }
    // user role: text becomes a user message; each tool_result a `tool` message.
    const text = m.content
      .filter((b) => b.type === "text")
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    if (text.length > 0) out.push({ role: "user", content: text });
    for (const b of m.content) {
      if (b.type === "tool_result") {
        out.push({
          role: "tool",
          tool_call_id: b.tool_use_id,
          // Chat Completions has no error flag on tool results — fold it into the text.
          content: b.is_error ? `ERROR: ${b.content}` : b.content,
        });
      }
    }
  }
  return out;
}

function toOpenAIAssistant(m: Message): ChatCompletionMessageParam {
  let text = "";
  const toolCalls: ChatCompletionMessageToolCall[] = [];
  for (const b of m.content) {
    if (b.type === "text") {
      text += b.text;
    } else if (b.type === "tool_use") {
      toolCalls.push({
        id: b.id,
        type: "function",
        // OpenAI takes the arguments as a JSON *string*.
        function: { name: b.name, arguments: JSON.stringify(b.input) },
      });
    }
  }
  return {
    role: "assistant",
    // `content` must be null (not "") when only tool_calls are present.
    content: text.length > 0 ? text : null,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  };
}

function toOpenAITool(tool: ToolDefinition): ChatCompletionTool {
  return {
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
  };
}

// --- mapping: OpenAI -> ours ------------------------------------------------

function fromOpenAIResponse(res: ChatCompletion, model: string): ModelResponse {
  const choice = res.choices[0];
  const message = choice?.message;
  const content: ContentBlock[] = [];
  if (message?.content) content.push({ type: "text", text: message.content });
  else if (message?.refusal) content.push({ type: "text", text: message.refusal });
  for (const tc of message?.tool_calls ?? []) {
    if (tc.type !== "function") continue; // custom tool calls aren't used here
    content.push({
      type: "tool_use",
      id: tc.id,
      name: tc.function.name,
      input: parseArgs(tc.function.arguments),
    });
  }
  // Map the stop reason, but never claim tool_use without an actual tool_use block.
  const hasToolUse = content.some((b) => b.type === "tool_use");
  return {
    content,
    stop_reason: mapStopReason(choice?.finish_reason, hasToolUse),
    usage: {
      input_tokens: res.usage?.prompt_tokens ?? 0,
      output_tokens: res.usage?.completion_tokens ?? 0,
    },
    model: res.model || model,
  };
}

/** Tool-call arguments arrive as a JSON string; tolerate malformed output. */
function parseArgs(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function mapStopReason(
  reason: ChatCompletion.Choice["finish_reason"] | undefined,
  hasToolUse: boolean,
): StopReason {
  // Some compatible gateways report finish_reason "stop" while still returning
  // tool_calls — infer from the blocks so the loop never drops the calls.
  if (hasToolUse) return "tool_use";
  switch (reason) {
    case "length":
      return "max_tokens";
    default:
      // stop, content_filter, function_call, tool_calls (without a usable call)
      return "end_turn";
  }
}
