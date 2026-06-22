import { test, expect, describe } from "bun:test";
import type OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import { OpenAIProvider } from "./openai";
import { runCompletionContract } from "./contract";
import { OPENAI_MODELS } from "./models";
import { textOf, toolUses, userText, validateModelResponse } from "@auriga/core";

/** A fake OpenAI client that returns a canned completion and records the last params. */
function fakeClient(completion: ChatCompletion): {
  client: OpenAI;
  lastParams: () => ChatCompletionCreateParamsNonStreaming | undefined;
} {
  let captured: ChatCompletionCreateParamsNonStreaming | undefined;
  const client = {
    chat: {
      completions: {
        create: async (params: ChatCompletionCreateParamsNonStreaming) => {
          captured = params;
          return completion;
        },
      },
    },
  } as unknown as OpenAI;
  return { client, lastParams: () => captured };
}

function completion(over: Partial<ChatCompletion> & { choice?: Partial<ChatCompletion.Choice> }) {
  const { choice, ...rest } = over;
  return {
    id: "cmpl_1",
    created: 0,
    object: "chat.completion",
    model: OPENAI_MODELS.gpt4o,
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        logprobs: null,
        message: { role: "assistant", content: "pong", refusal: null },
        ...choice,
      },
    ],
    usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 },
    ...rest,
  } as ChatCompletion;
}

test("maps an OpenAI text response to a ModelResponse", async () => {
  const { client } = fakeClient(completion({}));
  const provider = new OpenAIProvider({ client });
  const res = await provider.complete({
    model: OPENAI_MODELS.gpt4o,
    max_tokens: 16,
    messages: [userText("ping")],
  });
  validateModelResponse(res);
  expect(textOf(res.content)).toBe("pong");
  expect(res.usage.input_tokens).toBe(5);
  expect(res.stop_reason).toBe("end_turn");
  expect(res.model).toBe(OPENAI_MODELS.gpt4o);
});

test("maps an OpenAI tool_call response, parsing JSON-string arguments", async () => {
  const { client } = fakeClient(
    completion({
      choice: {
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          refusal: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "bash", arguments: '{"cmd":"ls"}' },
            },
          ],
        },
      },
    }),
  );
  const provider = new OpenAIProvider({ client });
  const res = await provider.complete({
    model: OPENAI_MODELS.gpt4o,
    max_tokens: 16,
    messages: [userText("list files")],
    tools: [{ name: "bash", description: "run a shell command", input_schema: { type: "object" } }],
  });
  validateModelResponse(res);
  expect(res.stop_reason).toBe("tool_use");
  expect(toolUses(res.content)[0]?.id).toBe("call_1");
  expect(toolUses(res.content)[0]?.input).toEqual({ cmd: "ls" });
});

test("builds request shapes: stringified args, tool-result message, and id continuity", async () => {
  const { client, lastParams } = fakeClient(completion({}));
  const provider = new OpenAIProvider({ client });
  await provider.complete({
    model: OPENAI_MODELS.gpt4o,
    max_tokens: 16,
    system: "be terse",
    messages: [
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "call_1", name: "bash", input: { cmd: "ls" } }],
      },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "done" }] },
    ],
  });
  const msgs = lastParams()?.messages ?? [];
  expect(msgs[0]).toEqual({ role: "system", content: "be terse" });
  // assistant turn: content null, tool_calls with arguments serialized to a JSON string.
  const assistant = msgs[1] as {
    role: string;
    content: string | null;
    tool_calls: { id: string; function: { arguments: string } }[];
  };
  expect(assistant.role).toBe("assistant");
  expect(assistant.content).toBeNull();
  expect(assistant.tool_calls[0]?.function.arguments).toBe('{"cmd":"ls"}');
  // tool result becomes a `tool` message keyed by the same id.
  expect(msgs[2]).toEqual({ role: "tool", tool_call_id: "call_1", content: "done" });
  // o1/o3 compatibility: we send max_completion_tokens, not max_tokens.
  expect(lastParams()?.max_completion_tokens).toBe(16);
});

test("the mapped response satisfies the completion contract", async () => {
  const { client } = fakeClient(completion({}));
  await runCompletionContract(new OpenAIProvider({ client }), OPENAI_MODELS.gpt4o);
});

// Live test — only runs when an API key is present.
describe.if(Boolean(process.env.OPENAI_API_KEY))("OpenAIProvider (live)", () => {
  test("completes against the real API", async () => {
    const provider = new OpenAIProvider();
    const res = await provider.complete({
      model: OPENAI_MODELS.gpt4oMini,
      max_tokens: 32,
      messages: [userText("Reply with exactly one word: pong")],
    });
    validateModelResponse(res);
    expect(textOf(res.content).length).toBeGreaterThan(0);
  }, 30_000);
});
