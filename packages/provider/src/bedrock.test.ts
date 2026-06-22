import { test, expect, describe } from "bun:test";
import type {
  BedrockRuntimeClient,
  ConverseCommandInput,
  ConverseResponse,
} from "@aws-sdk/client-bedrock-runtime";
import { BedrockProvider } from "./bedrock";
import { runCompletionContract } from "./contract";
import { BEDROCK_MODELS } from "./models";
import { textOf, toolUses, userText, validateModelResponse } from "@auriga/core";

/** A fake Converse client that returns a canned response and records the last command input. */
function fakeClient(response: ConverseResponse): {
  client: BedrockRuntimeClient;
  lastInput: () => ConverseCommandInput | undefined;
} {
  let captured: ConverseCommandInput | undefined;
  const client = {
    send: async (command: { input: ConverseCommandInput }) => {
      captured = command.input;
      return response;
    },
  } as unknown as BedrockRuntimeClient;
  return { client, lastInput: () => captured };
}

test("maps a Bedrock text response to a ModelResponse", async () => {
  const { client } = fakeClient({
    output: { message: { role: "assistant", content: [{ text: "pong" }] } },
    stopReason: "end_turn",
    usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7 },
    metrics: { latencyMs: 1 },
  });
  const provider = new BedrockProvider({ client });
  const res = await provider.complete({
    model: BEDROCK_MODELS.claudeSonnet,
    max_tokens: 16,
    messages: [userText("ping")],
  });
  validateModelResponse(res);
  expect(textOf(res.content)).toBe("pong");
  expect(res.usage.input_tokens).toBe(5);
  expect(res.stop_reason).toBe("end_turn");
  // Converse doesn't echo the modelId — the adapter falls back to the request model.
  expect(res.model).toBe(BEDROCK_MODELS.claudeSonnet);
});

test("maps a Bedrock tool_use response and preserves the toolUseId", async () => {
  const { client } = fakeClient({
    output: {
      message: {
        role: "assistant",
        content: [{ toolUse: { toolUseId: "tu_1", name: "bash", input: { cmd: "ls" } } }],
      },
    },
    stopReason: "tool_use",
    usage: { inputTokens: 8, outputTokens: 4, totalTokens: 12 },
    metrics: { latencyMs: 1 },
  });
  const provider = new BedrockProvider({ client });
  const res = await provider.complete({
    model: BEDROCK_MODELS.claudeSonnet,
    max_tokens: 16,
    messages: [userText("list files")],
    tools: [{ name: "bash", description: "run a shell command", input_schema: { type: "object" } }],
  });
  validateModelResponse(res);
  expect(res.stop_reason).toBe("tool_use");
  expect(toolUses(res.content)[0]?.id).toBe("tu_1");
  expect(toolUses(res.content)[0]?.input).toEqual({ cmd: "ls" });
});

test("builds Converse request shapes: system, tool schema, and matching tool-result id", async () => {
  const { client, lastInput } = fakeClient({
    output: { message: { role: "assistant", content: [{ text: "ok" }] } },
    stopReason: "end_turn",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    metrics: { latencyMs: 1 },
  });
  const provider = new BedrockProvider({ client });
  await provider.complete({
    model: BEDROCK_MODELS.claudeSonnet,
    max_tokens: 16,
    system: "be terse",
    tools: [{ name: "bash", description: "run a shell command", input_schema: { type: "object" } }],
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: "bash", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "done" }] },
    ],
  });
  const input = lastInput();
  expect(input?.system).toEqual([{ text: "be terse" }]);
  expect(input?.toolConfig?.tools?.[0]?.toolSpec?.inputSchema).toEqual({
    json: { type: "object" },
  });
  // The tool_result must carry the same toolUseId the assistant turn requested.
  const resultBlock = input?.messages?.[1]?.content?.[0];
  expect(resultBlock?.toolResult?.toolUseId).toBe("tu_1");
});

test("the mapped response satisfies the completion contract", async () => {
  const { client } = fakeClient({
    output: { message: { role: "assistant", content: [{ text: "ok" }] } },
    stopReason: "end_turn",
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    metrics: { latencyMs: 1 },
  });
  await runCompletionContract(new BedrockProvider({ client }), BEDROCK_MODELS.claudeSonnet);
});

// Live test — only runs when AWS credentials are present.
describe.if(Boolean(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE))(
  "BedrockProvider (live)",
  () => {
    test("completes against the real API", async () => {
      const provider = new BedrockProvider();
      const res = await provider.complete({
        model: BEDROCK_MODELS.claudeSonnet,
        max_tokens: 32,
        messages: [userText("Reply with exactly one word: pong")],
      });
      validateModelResponse(res);
      expect(textOf(res.content).length).toBeGreaterThan(0);
    }, 30_000);
  },
);
