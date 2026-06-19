import { newId } from "../ids";
import { ValidationError } from "../errors";
import type {
  ContentBlock,
  Message,
  ModelResponse,
  TextBlock,
  ToolResultBlock,
  ToolUseBlock,
  Usage,
} from "./types";

// --- block type guards -------------------------------------------------------

export function isText(block: ContentBlock): block is TextBlock {
  return block.type === "text";
}

export function isToolUse(block: ContentBlock): block is ToolUseBlock {
  return block.type === "tool_use";
}

export function isToolResult(block: ContentBlock): block is ToolResultBlock {
  return block.type === "tool_result";
}

// --- accessors ---------------------------------------------------------------

/** Concatenate all text blocks in a content array. */
export function textOf(content: readonly ContentBlock[]): string {
  return content
    .filter(isText)
    .map((b) => b.text)
    .join("");
}

/** Extract all tool_use blocks (the model's requested tool calls). */
export function toolUses(content: readonly ContentBlock[]): ToolUseBlock[] {
  return content.filter(isToolUse);
}

// --- message builders --------------------------------------------------------

export function userText(text: string): Message {
  return { role: "user", content: [{ type: "text", text }] };
}

export function assistantText(text: string): Message {
  return { role: "assistant", content: [{ type: "text", text }] };
}

export function toolResultBlock(
  toolUseId: string,
  content: string,
  isError = false,
): ToolResultBlock {
  return { type: "tool_result", tool_use_id: toolUseId, content, is_error: isError };
}

/** Wrap tool results as a user-role message (the conventional way to feed results back). */
export function toolResultMessage(results: ToolResultBlock[]): Message {
  return { role: "user", content: results };
}

// --- response builders (used by the stub provider and tests) -----------------

const NO_USAGE: Usage = { input_tokens: 0, output_tokens: 0 };

export function textResponse(
  text: string,
  opts: { model?: string; usage?: Usage } = {},
): ModelResponse {
  return {
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    usage: opts.usage ?? NO_USAGE,
    model: opts.model ?? "stub",
  };
}

export function toolUseResponse(
  name: string,
  input: Record<string, unknown>,
  opts: { id?: string; model?: string; usage?: Usage } = {},
): ModelResponse {
  return {
    content: [{ type: "tool_use", id: opts.id ?? newId("toolu"), name, input }],
    stop_reason: "tool_use",
    usage: opts.usage ?? NO_USAGE,
    model: opts.model ?? "stub",
  };
}

// --- validation --------------------------------------------------------------

/** Throw if a ModelResponse is structurally invalid. Used by the provider contract. */
export function validateModelResponse(res: ModelResponse): void {
  if (!Array.isArray(res.content)) {
    throw new ValidationError("ModelResponse.content must be an array");
  }
  const reasons = ["end_turn", "tool_use", "max_tokens", "stop_sequence"];
  if (!reasons.includes(res.stop_reason)) {
    throw new ValidationError(`ModelResponse.stop_reason invalid: ${res.stop_reason}`);
  }
  if (typeof res.usage?.input_tokens !== "number" || typeof res.usage?.output_tokens !== "number") {
    throw new ValidationError("ModelResponse.usage must have numeric token counts");
  }
  if (typeof res.model !== "string" || res.model.length === 0) {
    throw new ValidationError("ModelResponse.model must be a non-empty string");
  }
  if (res.stop_reason === "tool_use" && toolUses(res.content).length === 0) {
    throw new ValidationError("stop_reason tool_use requires at least one tool_use block");
  }
}
