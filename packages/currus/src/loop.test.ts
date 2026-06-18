import { test, expect } from "bun:test";
import { textResponse, toolUseResponse, userText } from "@auriga/core";
import { StubProvider } from "@auriga/provider";
import { runLoop } from "./loop";
import { echoTool } from "./tools/echo";

test("dispatches a tool call, feeds the result back, then completes", async () => {
  const provider = new StubProvider([
    toolUseResponse("echo", { text: "hello" }),
    textResponse("done: hello"),
  ]);
  const result = await runLoop({
    provider,
    model: "stub",
    messages: [userText("please echo hello")],
    tools: [echoTool],
    maxSteps: 5,
  });

  expect(result.stop).toBe("completed");
  expect(result.steps).toBe(2);
  expect(result.text).toBe("done: hello");

  // the second model call must have seen the echo tool's result fed back
  expect(provider.calls).toHaveLength(2);
  const fedBack = provider.calls[1]?.messages.at(-1);
  expect(fedBack?.role).toBe("user");
  expect(fedBack?.content[0]).toMatchObject({ type: "tool_result", content: "hello" });
});

test("an unknown tool yields an error result but the loop recovers", async () => {
  const provider = new StubProvider([
    toolUseResponse("nonexistent", {}),
    textResponse("recovered"),
  ]);
  const result = await runLoop({
    provider,
    model: "stub",
    messages: [userText("x")],
    tools: [echoTool],
  });
  expect(result.text).toBe("recovered");
  const fedBack = provider.calls[1]?.messages.at(-1);
  expect(fedBack?.content[0]).toMatchObject({ type: "tool_result", is_error: true });
});

test("stops at maxSteps when the model keeps calling tools", async () => {
  const provider = new StubProvider([
    toolUseResponse("echo", { text: "a" }),
    toolUseResponse("echo", { text: "b" }),
    toolUseResponse("echo", { text: "c" }),
  ]);
  const result = await runLoop({
    provider,
    model: "stub",
    messages: [userText("loop forever")],
    tools: [echoTool],
    maxSteps: 3,
  });
  expect(result.stop).toBe("max_steps");
  expect(result.steps).toBe(3);
});

test("usage accumulates across steps", async () => {
  const provider = new StubProvider([
    toolUseResponse("echo", { text: "x" }, { usage: { input_tokens: 10, output_tokens: 5 } }),
    textResponse("ok", { usage: { input_tokens: 7, output_tokens: 3 } }),
  ]);
  const result = await runLoop({
    provider,
    model: "stub",
    messages: [userText("x")],
    tools: [echoTool],
  });
  expect(result.usage).toEqual({ input_tokens: 17, output_tokens: 8 });
});
