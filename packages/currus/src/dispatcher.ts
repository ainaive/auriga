import type { ToolDefinition } from "@auriga/core";
import type { Tool } from "./tool";

export interface ToolDispatchResult {
  content: string;
  isError: boolean;
}

/**
 * Holds the registered tools plus the job's allowlist, and enforces it **in code**
 * (principle: permissions in code, not the prompt). The model is only shown
 * allowed tool definitions, and a call to a disallowed/unknown tool is rejected
 * before the tool runs.
 */
export class ToolDispatcher {
  private readonly byName: Map<string, Tool>;
  private readonly allowed: Set<string> | null;

  constructor(tools: Tool[], allowed?: string[]) {
    this.byName = new Map(tools.map((t) => [t.name, t]));
    this.allowed = allowed ? new Set(allowed) : null;
  }

  private isAllowed(name: string): boolean {
    return this.allowed === null || this.allowed.has(name);
  }

  /** Tool definitions exposed to the model — registered AND allowed only. */
  definitions(): ToolDefinition[] {
    const out: ToolDefinition[] = [];
    for (const tool of this.byName.values()) {
      if (!this.isAllowed(tool.name)) continue;
      out.push({ name: tool.name, description: tool.description, input_schema: tool.input_schema });
    }
    return out;
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  async dispatch(name: string, input: Record<string, unknown>): Promise<ToolDispatchResult> {
    if (!this.isAllowed(name)) {
      return { content: `tool not permitted: ${name}`, isError: true };
    }
    const tool = this.byName.get(name);
    if (!tool) {
      return { content: `unknown tool: ${name}`, isError: true };
    }
    try {
      return { content: await tool.run(input), isError: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { content: `tool error: ${message}`, isError: true };
    }
  }
}
