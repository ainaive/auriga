import { test, expect } from "bun:test";
import { StubProvider } from "./stub";
import { runCompletionContract } from "./contract";
import { textOf, textResponse, toolUseResponse, toolUses, userText } from "@auriga/core";

test("stub replays scripted responses in order", async () => {
  const stub = new StubProvider([textResponse("first"), textResponse("second")]);
  const a = await stub.complete({ model: "stub", max_tokens: 8, messages: [userText("x")] });
  const b = await stub.complete({ model: "stub", max_tokens: 8, messages: [userText("y")] });
  expect(textOf(a.content)).toBe("first");
  expect(textOf(b.content)).toBe("second");
});

test("stub records every request", async () => {
  const stub = new StubProvider([textResponse("ok")]);
  await stub.complete({ model: "stub", max_tokens: 8, messages: [userText("hello")] });
  expect(stub.calls).toHaveLength(1);
  expect(textOf(stub.calls[0]?.messages[0]?.content ?? [])).toBe("hello");
});

test("stub throws when exhausted", async () => {
  const stub = new StubProvider();
  await expect(
    stub.complete({ model: "stub", max_tokens: 8, messages: [] }),
  ).rejects.toThrow();
});

test("stub satisfies the completion contract", async () => {
  const stub = new StubProvider([textResponse("pong")]);
  await runCompletionContract(stub, "stub");
});

test("a tool_use response carries the call and stop reason", async () => {
  const stub = new StubProvider([toolUseResponse("bash", { cmd: "ls" })]);
  const res = await stub.complete({ model: "stub", max_tokens: 8, messages: [userText("x")] });
  expect(res.stop_reason).toBe("tool_use");
  expect(toolUses(res.content)[0]?.name).toBe("bash");
  expect(toolUses(res.content)[0]?.input).toEqual({ cmd: "ls" });
});
