import { test, expect } from "bun:test";
import { LocalSandboxDriver } from "@auriga/sandbox";
import { ToolDispatcher } from "./dispatcher";
import { WorkspaceMemory, makeMemoryTools } from "./memory";

test("todo + scratchpad round trip on the sandbox FS", async () => {
  const sbx = await new LocalSandboxDriver().create({ workspace: { kind: "empty" } });
  try {
    const memory = new WorkspaceMemory(sbx);
    expect(await memory.readTodo()).toBe("");
    await memory.writeTodo("- [ ] step 1");
    expect(await memory.readTodo()).toContain("step 1");

    await memory.appendScratchpad("note A");
    await memory.appendScratchpad("note B");
    const scratch = await sbx.readFile(memory.scratchpadPath());
    expect(scratch).toContain("note A");
    expect(scratch).toContain("note B");
  } finally {
    await sbx.destroy();
  }
});

test("memory tools operate via the dispatcher", async () => {
  const sbx = await new LocalSandboxDriver().create({ workspace: { kind: "empty" } });
  try {
    const memory = new WorkspaceMemory(sbx);
    const dispatcher = new ToolDispatcher(makeMemoryTools(memory));

    await dispatcher.dispatch("update_todo", { content: "- [ ] do it" });
    const read = await dispatcher.dispatch("read_todo", {});
    expect(read.content).toContain("do it");

    await dispatcher.dispatch("note", { text: "remember this" });
    expect(await sbx.readFile(memory.scratchpadPath())).toContain("remember this");
  } finally {
    await sbx.destroy();
  }
});
