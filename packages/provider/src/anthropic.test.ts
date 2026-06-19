import { test, expect, describe } from "bun:test";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicProvider } from "./anthropic";
import { runCompletionContract } from "./contract";
import { MODELS } from "./models";
import { textOf, toolUses, userText, validateModelResponse } from "@auriga/core";

/** Build a fake Anthropic client that returns a canned message — no network. */
function fakeClient(message: unknown): Anthropic {
  return {
    messages: {
      create: async () => message,
    },
  } as unknown as Anthropic;
}

test("maps an Anthropic text response to a ModelResponse", async () => {
  const provider = new AnthropicProvider({
    client: fakeClient({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: MODELS.haiku,
      content: [{ type: "text", text: "pong" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 2 },
    }),
  });
  const res = await provider.complete({
    model: MODELS.haiku,
    max_tokens: 16,
    messages: [userText("ping")],
  });
  validateModelResponse(res);
  expect(textOf(res.content)).toBe("pong");
  expect(res.usage.input_tokens).toBe(5);
  expect(res.stop_reason).toBe("end_turn");
  expect(res.model).toBe(MODELS.haiku);
});

test("maps an Anthropic tool_use response", async () => {
  const provider = new AnthropicProvider({
    client: fakeClient({
      id: "msg_2",
      type: "message",
      role: "assistant",
      model: MODELS.sonnet,
      content: [{ type: "tool_use", id: "tu_1", name: "bash", input: { cmd: "ls" } }],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 8, output_tokens: 4 },
    }),
  });
  const res = await provider.complete({
    model: MODELS.sonnet,
    max_tokens: 16,
    messages: [userText("list files")],
    tools: [{ name: "bash", description: "run a shell command", input_schema: { type: "object" } }],
  });
  validateModelResponse(res);
  expect(res.stop_reason).toBe("tool_use");
  expect(toolUses(res.content)[0]?.input).toEqual({ cmd: "ls" });
});

test("the mapped response satisfies the completion contract", async () => {
  const provider = new AnthropicProvider({
    client: fakeClient({
      id: "msg_3",
      type: "message",
      role: "assistant",
      model: MODELS.haiku,
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    }),
  });
  await runCompletionContract(provider, MODELS.haiku);
});

// Live test — only runs when an API key is present.
describe.if(Boolean(process.env.ANTHROPIC_API_KEY))("AnthropicProvider (live)", () => {
  test("completes against the real API", async () => {
    const provider = new AnthropicProvider();
    const res = await provider.complete({
      model: MODELS.haiku,
      max_tokens: 32,
      messages: [userText("Reply with exactly one word: pong")],
    });
    validateModelResponse(res);
    expect(textOf(res.content).length).toBeGreaterThan(0);
  }, 30_000);
});
