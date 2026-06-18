import { test, expect } from "bun:test";
import {
  assistantText,
  textOf,
  textResponse,
  toolResultBlock,
  toolResultMessage,
  toolUseResponse,
  toolUses,
  userText,
  validateModelResponse,
} from "./helpers";
import { ValidationError } from "../errors";

test("userText / assistantText build single-text-block messages", () => {
  expect(userText("hi")).toEqual({ role: "user", content: [{ type: "text", text: "hi" }] });
  expect(assistantText("yo").role).toBe("assistant");
});

test("textOf concatenates text blocks and ignores others", () => {
  const content = [
    { type: "text", text: "a" },
    { type: "tool_use", id: "t1", name: "x", input: {} },
    { type: "text", text: "b" },
  ] as const;
  expect(textOf([...content])).toBe("ab");
});

test("toolUses extracts tool_use blocks", () => {
  const res = toolUseResponse("bash", { cmd: "ls" });
  const calls = toolUses(res.content);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.name).toBe("bash");
  expect(calls[0]?.input).toEqual({ cmd: "ls" });
});

test("toolResultMessage wraps results as a user message", () => {
  const msg = toolResultMessage([toolResultBlock("t1", "done")]);
  expect(msg.role).toBe("user");
  expect(msg.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1", content: "done" });
});

test("textResponse and toolUseResponse are valid model responses", () => {
  expect(() => validateModelResponse(textResponse("ok"))).not.toThrow();
  expect(() => validateModelResponse(toolUseResponse("t", {}))).not.toThrow();
});

test("validateModelResponse rejects tool_use stop without a tool_use block", () => {
  expect(() =>
    validateModelResponse({
      content: [{ type: "text", text: "x" }],
      stop_reason: "tool_use",
      usage: { input_tokens: 1, output_tokens: 1 },
      model: "m",
    }),
  ).toThrow(ValidationError);
});
