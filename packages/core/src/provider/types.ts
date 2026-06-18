/**
 * Provider-agnostic model interface. A thin seam over any chat/tool-use model so
 * the backend stays swappable (plan §1, decision 7). Shapes are intentionally
 * close to the common message/tool-use denominator; each provider adapter maps
 * its SDK to/from these types.
 */

export type MessageRole = "user" | "assistant";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: MessageRole;
  content: ContentBlock[];
}

/** A tool the model may call. `input_schema` is a JSON Schema object. */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface GenerateRequest {
  model: string;
  messages: Message[];
  system?: string;
  tools?: ToolDefinition[];
  max_tokens: number;
  temperature?: number;
  stop_sequences?: string[];
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "stop_sequence";

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface ModelResponse {
  /** Assistant output blocks (text and/or tool_use). */
  content: ContentBlock[];
  stop_reason: StopReason;
  usage: Usage;
  model: string;
}

/**
 * The swappable backend. Implementations live in @auriga/provider. Kept minimal
 * on purpose; streaming is added later behind an optional method.
 */
export interface ModelProvider {
  readonly name: string;
  complete(req: GenerateRequest): Promise<ModelResponse>;
  countTokens?(req: GenerateRequest): Promise<number>;
}
