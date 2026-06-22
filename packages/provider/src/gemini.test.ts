import { test, expect, describe } from "bun:test";
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  GoogleGenAI,
} from "@google/genai";
import { GeminiProvider, sanitizeGeminiSchema } from "./gemini";
import { runCompletionContract } from "./contract";
import { GEMINI_MODELS } from "./models";
import { textOf, toolUses, userText, validateModelResponse } from "@auriga/core";

/** A fake genai client that returns a canned response and records the last params. */
function fakeClient(response: GenerateContentResponse): {
  client: GoogleGenAI;
  lastParams: () => GenerateContentParameters | undefined;
} {
  let captured: GenerateContentParameters | undefined;
  const client = {
    models: {
      generateContent: async (params: GenerateContentParameters) => {
        captured = params;
        return response;
      },
      countTokens: async () => ({ totalTokens: 7 }),
    },
  } as unknown as GoogleGenAI;
  return { client, lastParams: () => captured };
}

function response(parts: unknown[], finishReason = "STOP"): GenerateContentResponse {
  return {
    candidates: [{ content: { role: "model", parts }, finishReason }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2, totalTokenCount: 7 },
  } as unknown as GenerateContentResponse;
}

test("maps a Gemini text response to a ModelResponse", async () => {
  const { client } = fakeClient(response([{ text: "pong" }]));
  const provider = new GeminiProvider({ client });
  const res = await provider.complete({
    model: GEMINI_MODELS.pro,
    max_tokens: 16,
    messages: [userText("ping")],
  });
  validateModelResponse(res);
  expect(textOf(res.content)).toBe("pong");
  expect(res.usage.input_tokens).toBe(5);
  expect(res.stop_reason).toBe("end_turn");
  // The response doesn't echo the model id — the adapter falls back to the request model.
  expect(res.model).toBe(GEMINI_MODELS.pro);
});

test("infers tool_use from a functionCall part even though finishReason is STOP", async () => {
  const { client } = fakeClient(
    response([{ functionCall: { name: "bash", args: { cmd: "ls" } } }], "STOP"),
  );
  const provider = new GeminiProvider({ client });
  const res = await provider.complete({
    model: GEMINI_MODELS.pro,
    max_tokens: 16,
    messages: [userText("list files")],
    tools: [{ name: "bash", description: "run a shell command", input_schema: { type: "object" } }],
  });
  validateModelResponse(res);
  expect(res.stop_reason).toBe("tool_use");
  expect(toolUses(res.content)[0]?.name).toBe("bash");
  expect(toolUses(res.content)[0]?.input).toEqual({ cmd: "ls" });
  // A synthesized, non-empty id is required so the result can round-trip.
  expect(toolUses(res.content)[0]?.id.length).toBeGreaterThan(0);
});

test("builds request shapes: model role, systemInstruction, and functionResponse name recovery", async () => {
  const { client, lastParams } = fakeClient(response([{ text: "ok" }]));
  const provider = new GeminiProvider({ client });
  await provider.complete({
    model: GEMINI_MODELS.pro,
    max_tokens: 16,
    system: "be terse",
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "tu_1", name: "bash", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_1", content: "done" }] },
    ],
  });
  const params = lastParams();
  const contents = params?.contents as { role: string; parts: Record<string, unknown>[] }[];
  // assistant -> "model" role.
  expect(contents[0]?.role).toBe("model");
  expect(contents[1]?.role).toBe("user");
  // systemInstruction is carried in config, not contents.
  expect(params?.config?.systemInstruction).toBe("be terse");
  // The tool_result is keyed by the function *name* recovered from the tool_use id.
  expect(contents[1]?.parts[0]?.functionResponse).toEqual({
    name: "bash",
    response: { result: "done" },
  });
});

test("sanitizeGeminiSchema strips unsupported JSON-Schema keywords recursively", () => {
  const cleaned = sanitizeGeminiSchema({
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string" },
      meta: { type: "object", additionalProperties: true, const: "x" },
    },
    required: ["name"],
  });
  expect(cleaned).toEqual({
    type: "object",
    properties: {
      name: { type: "string" },
      meta: { type: "object" },
    },
    required: ["name"],
  });
});

test("the mapped response satisfies the completion contract", async () => {
  const { client } = fakeClient(response([{ text: "ok" }]));
  await runCompletionContract(new GeminiProvider({ client }), GEMINI_MODELS.pro);
});

// Live test — only runs when an API key is present.
describe.if(Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY))(
  "GeminiProvider (live)",
  () => {
    test("completes against the real API", async () => {
      const provider = new GeminiProvider();
      const res = await provider.complete({
        model: GEMINI_MODELS.flash,
        max_tokens: 32,
        messages: [userText("Reply with exactly one word: pong")],
      });
      validateModelResponse(res);
      expect(textOf(res.content).length).toBeGreaterThan(0);
    }, 30_000);
  },
);
