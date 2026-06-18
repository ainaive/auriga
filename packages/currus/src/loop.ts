import {
  textOf,
  toolResultBlock,
  toolResultMessage,
  toolUses,
  type Message,
  type ModelProvider,
  type ToolDefinition,
  type ToolResultBlock,
  type Usage,
} from "@auriga/core";
import type { Tool } from "./tool";

export interface RunLoopOptions {
  provider: ModelProvider;
  model: string;
  messages: Message[];
  tools?: Tool[];
  system?: string;
  /** Hard cap on iterations (a budget backstop). */
  maxSteps?: number;
  /** max_tokens per model call. */
  maxTokens?: number;
}

export interface LoopResult {
  /** Final assistant text once the model stops calling tools. */
  text: string;
  steps: number;
  /** Accumulated token usage across all model calls. */
  usage: Usage;
  /** Full transcript (input messages + assistant turns + tool results). */
  messages: Message[];
  stop: "completed" | "max_steps";
}

/**
 * The minimal agent loop: call the model → if it requested tools, dispatch them
 * and feed results back → repeat until the model stops calling tools or maxSteps
 * is hit. This is the seed of the Plan-Execute-Verify loop expanded in Phase 1.
 */
export async function runLoop(opts: RunLoopOptions): Promise<LoopResult> {
  const tools = opts.tools ?? [];
  const toolDefs: ToolDefinition[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
  const byName = new Map(tools.map((t) => [t.name, t]));
  const messages = [...opts.messages];
  const maxSteps = opts.maxSteps ?? 10;
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };

  for (let step = 1; step <= maxSteps; step++) {
    const res = await opts.provider.complete({
      model: opts.model,
      // snapshot: the provider must see the state at call time, not a live ref
      messages: [...messages],
      max_tokens: opts.maxTokens ?? 1024,
      ...(opts.system ? { system: opts.system } : {}),
      ...(toolDefs.length ? { tools: toolDefs } : {}),
    });
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    messages.push({ role: "assistant", content: res.content });

    const calls = toolUses(res.content);
    if (res.stop_reason !== "tool_use" || calls.length === 0) {
      return { text: textOf(res.content), steps: step, usage, messages, stop: "completed" };
    }

    const results: ToolResultBlock[] = [];
    for (const call of calls) {
      const tool = byName.get(call.name);
      if (!tool) {
        results.push(toolResultBlock(call.id, `unknown tool: ${call.name}`, true));
        continue;
      }
      try {
        const output = await tool.run(call.input);
        results.push(toolResultBlock(call.id, output));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push(toolResultBlock(call.id, `tool error: ${message}`, true));
      }
    }
    messages.push(toolResultMessage(results));
  }

  return { text: "", steps: maxSteps, usage, messages, stop: "max_steps" };
}
