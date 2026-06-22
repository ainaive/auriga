import { test, expect, afterEach } from "bun:test";
import { ValidationError, type ModelProvider } from "@auriga/core";
import {
  credentialEnvFor,
  hasCredentials,
  providerFor,
  providerKindFor,
  resolveModel,
} from "./factory";
import type { ProviderName } from "./factory";

const savedEnv: Record<string, string | undefined> = {};
afterEach(() => {
  // Restore only the keys a test actually touched, back to their original values.
  for (const k of Object.keys(savedEnv)) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
    delete savedEnv[k];
  }
});
function setEnv(key: string, value: string | undefined): void {
  // Snapshot the original once, so repeated mutations of the same key don't clobber it.
  if (!(key in savedEnv)) savedEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

test("providerKindFor infers the backend from the model-id prefix", () => {
  const cases: [string, ProviderName][] = [
    ["claude-opus-4-8", "anthropic"],
    ["claude-sonnet-4-6", "anthropic"],
    ["gpt-4o", "openai"],
    ["gpt-4o-mini", "openai"],
    ["o3", "openai"],
    ["gemini-2.5-pro", "gemini"],
    ["gemini-2.5-flash", "gemini"],
    ["anthropic.claude-3-5-sonnet-20241022-v2:0", "bedrock"],
    ["us.anthropic.claude-3-5-sonnet-20241022-v2:0", "bedrock"],
    ["meta.llama3-1-70b-instruct-v1:0", "bedrock"],
    // OpenAI-compatible gateways
    ["deepseek-chat", "deepseek"],
    ["deepseek-reasoner", "deepseek"],
    ["qwen-plus", "bailian"],
    ["qwq-32b", "bailian"],
    ["kimi-k2-0905-preview", "moonshot"],
    ["moonshot-v1-8k", "moonshot"],
    ["glm-4-plus", "zhipu"],
  ];
  for (const [model, expected] of cases) {
    expect(providerKindFor(model)).toBe(expected);
  }
});

test("providerKindFor throws on an unrecognized model id", () => {
  expect(() => providerKindFor("mystery-model")).toThrow(ValidationError);
});

test("resolveModel honors a vendor/model override and strips the prefix", () => {
  // Override forces the backend and returns the bare model id for the API call.
  expect(resolveModel("bailian/deepseek-r1")).toEqual({ kind: "bailian", model: "deepseek-r1" });
  expect(resolveModel("openai/gpt-4o")).toEqual({ kind: "openai", model: "gpt-4o" });
  expect(resolveModel("bedrock/anthropic.claude-3-5-sonnet-20241022-v2:0")).toEqual({
    kind: "bedrock",
    model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  });
  // No override → inferred, model unchanged.
  expect(resolveModel("deepseek-chat")).toEqual({ kind: "deepseek", model: "deepseek-chat" });
  // An unknown prefix before "/" is NOT treated as an override.
  expect(() => resolveModel("mystery/thing")).toThrow(ValidationError);
});

test("providerFor caches one instance per backend", () => {
  const cache = new Map<ProviderName, ModelProvider>();
  const a = providerFor("us.anthropic.claude-3-5-sonnet-20241022-v2:0", { cache });
  const b = providerFor("meta.llama3-1-70b-instruct-v1:0", { cache });
  expect(a.name).toBe("bedrock");
  expect(b).toBe(a); // same backend kind → same cached instance
});

test("providerFor constructs the right backend for each prefix", () => {
  // Dummy keys so the OpenAI SDK constructor (which requires a key) doesn't throw.
  setEnv("OPENAI_API_KEY", "test-key");
  setEnv("GEMINI_API_KEY", "test-key");
  setEnv("DEEPSEEK_API_KEY", "test-key");
  setEnv("DASHSCOPE_API_KEY", "test-key");
  expect(providerFor("claude-opus-4-8", { cache: new Map() }).name).toBe("anthropic");
  expect(providerFor("gpt-4o", { cache: new Map() }).name).toBe("openai");
  expect(providerFor("gemini-2.5-pro", { cache: new Map() }).name).toBe("gemini");
  // Compatible backends report their own name (not "openai") for traces/cost.
  expect(providerFor("deepseek-chat", { cache: new Map() }).name).toBe("deepseek");
  expect(providerFor("bailian/qwen-plus", { cache: new Map() }).name).toBe("bailian");
});

test("hasCredentials reflects the environment", () => {
  setEnv("OPENAI_API_KEY", undefined);
  expect(hasCredentials("openai")).toBe(false);
  setEnv("OPENAI_API_KEY", "sk-test");
  expect(hasCredentials("openai")).toBe(true);

  setEnv("GEMINI_API_KEY", undefined);
  setEnv("GOOGLE_API_KEY", "g-test");
  expect(hasCredentials("gemini")).toBe(true); // GOOGLE_API_KEY is an accepted fallback

  // Compatible backends check their own env var(s).
  setEnv("DEEPSEEK_API_KEY", undefined);
  expect(hasCredentials("deepseek")).toBe(false);
  setEnv("DEEPSEEK_API_KEY", "sk-test");
  expect(hasCredentials("deepseek")).toBe(true);

  // Bedrock defers to the AWS credential chain (resolved lazily by the SDK), so it's
  // always reported present even with no AWS env vars set.
  setEnv("AWS_ACCESS_KEY_ID", undefined);
  setEnv("AWS_PROFILE", undefined);
  setEnv("AWS_ROLE_ARN", undefined);
  expect(hasCredentials("bedrock")).toBe(true);
});

test("credentialEnvFor names the variable for each backend", () => {
  expect(credentialEnvFor("openai")).toContain("OPENAI_API_KEY");
  expect(credentialEnvFor("gemini")).toContain("GEMINI_API_KEY");
  expect(credentialEnvFor("bedrock")).toContain("AWS");
  expect(credentialEnvFor("deepseek")).toContain("DEEPSEEK_API_KEY");
  expect(credentialEnvFor("bailian")).toContain("DASHSCOPE_API_KEY");
});
