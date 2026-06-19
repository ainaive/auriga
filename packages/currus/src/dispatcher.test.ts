import { test, expect } from "bun:test";
import { ToolDispatcher } from "./dispatcher";
import { echoTool } from "./tools/echo";
import type { Tool } from "./tool";

test("definitions only include allowed tools", () => {
  const other: Tool = {
    name: "other",
    description: "",
    input_schema: { type: "object" },
    run: async () => "x",
  };
  const dispatcher = new ToolDispatcher([echoTool, other], ["echo"]);
  expect(dispatcher.definitions().map((d) => d.name)).toEqual(["echo"]);
});

test("dispatch rejects a non-allowlisted tool WITHOUT running it", async () => {
  let ran = false;
  const danger: Tool = {
    name: "danger",
    description: "",
    input_schema: { type: "object" },
    run: async () => {
      ran = true;
      return "ran";
    },
  };
  const dispatcher = new ToolDispatcher([danger], ["echo"]); // danger not allowed
  const result = await dispatcher.dispatch("danger", {});
  expect(result.isError).toBe(true);
  expect(result.content).toContain("not permitted");
  expect(ran).toBe(false);
});

test("no allowlist means all registered tools are allowed", async () => {
  const dispatcher = new ToolDispatcher([echoTool]);
  expect(await dispatcher.dispatch("echo", { text: "hi" })).toEqual({
    content: "hi",
    isError: false,
  });
});

test("unknown tool yields an error result", async () => {
  const dispatcher = new ToolDispatcher([echoTool]);
  const result = await dispatcher.dispatch("ghost", {});
  expect(result.isError).toBe(true);
  expect(result.content).toContain("unknown tool");
});

test("a throwing tool is captured as an error result", async () => {
  const boom: Tool = {
    name: "boom",
    description: "",
    input_schema: { type: "object" },
    run: async () => {
      throw new Error("kaboom");
    },
  };
  const dispatcher = new ToolDispatcher([boom]);
  const result = await dispatcher.dispatch("boom", {});
  expect(result.isError).toBe(true);
  expect(result.content).toContain("kaboom");
});
