import type { Sandbox } from "@auriga/sandbox";
import type { Tool } from "./tool";

/**
 * Filesystem-as-working-memory inside the sandbox. The plan (todo.md) and a
 * scratchpad live on disk so they survive context compaction and checkpoints,
 * rather than only in the message window.
 */
export class WorkspaceMemory {
  constructor(
    private readonly sandbox: Sandbox,
    private readonly dir = ".auriga",
  ) {}

  private path(name: string): string {
    return `${this.dir}/${name}`;
  }

  todoPath(): string {
    return this.path("todo.md");
  }

  scratchpadPath(): string {
    return this.path("scratchpad.md");
  }

  async readTodo(): Promise<string> {
    return this.read(this.todoPath());
  }

  async writeTodo(content: string): Promise<void> {
    await this.sandbox.writeFile(this.todoPath(), content);
  }

  async appendScratchpad(text: string): Promise<void> {
    const existing = await this.read(this.scratchpadPath());
    await this.sandbox.writeFile(this.scratchpadPath(), `${existing}${text}\n`);
  }

  private async read(path: string): Promise<string> {
    // Treat "absent" as empty, but surface real storage failures instead of
    // masking them (a swallowed read error could silently wipe the scratchpad).
    if (!(await this.sandbox.exists(path))) return "";
    return this.sandbox.readFile(path);
  }
}

/** Tools letting the model externalize its plan and notes to the filesystem. */
export function makeMemoryTools(memory: WorkspaceMemory): Tool[] {
  return [
    {
      name: "update_todo",
      description: "Replace the todo/plan list (a markdown checklist).",
      input_schema: {
        type: "object",
        properties: { content: { type: "string", description: "Full markdown checklist." } },
        required: ["content"],
      },
      async run(input) {
        if (typeof input.content !== "string") throw new Error("content must be a string");
        await memory.writeTodo(input.content);
        return "todo updated";
      },
    },
    {
      name: "read_todo",
      description: "Read the current todo/plan list.",
      input_schema: { type: "object", properties: {} },
      async run() {
        return (await memory.readTodo()) || "(empty)";
      },
    },
    {
      name: "note",
      description: "Append a note to the scratchpad for later reference.",
      input_schema: {
        type: "object",
        properties: { text: { type: "string", description: "Note to remember." } },
        required: ["text"],
      },
      async run(input) {
        if (typeof input.text !== "string") throw new Error("text must be a string");
        await memory.appendScratchpad(input.text);
        return "noted";
      },
    },
  ];
}
