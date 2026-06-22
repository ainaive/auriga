import { test, expect, afterEach } from "bun:test";
import { ValidationError, type ModelProvider } from "@auriga/core";
import { credentialEnvFor, hasCredentials, providerFor, providerKindFor } from "./factory";
import type { ProviderName } from "./factory";

const ENV_KEYS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_PROFILE",
  "AWS_ROLE_ARN",
] as const;
const savedEnv: Record<string, string | undefined> = {};
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
    delete savedEnv[k];
  }
});
function setEnv(key: string, value: string | undefined): void {
  savedEnv[key] = process.env[key];
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
  ];
  for (const [model, expected] of cases) {
    expect(providerKindFor(model)).toBe(expected);
  }
});

test("providerKindFor throws on an unrecognized model id", () => {
  expect(() => providerKindFor("mystery-model")).toThrow(ValidationError);
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
  expect(providerFor("claude-opus-4-8", { cache: new Map() }).name).toBe("anthropic");
  expect(providerFor("gpt-4o", { cache: new Map() }).name).toBe("openai");
  expect(providerFor("gemini-2.5-pro", { cache: new Map() }).name).toBe("gemini");
});

test("hasCredentials reflects the environment", () => {
  setEnv("OPENAI_API_KEY", undefined);
  expect(hasCredentials("openai")).toBe(false);
  setEnv("OPENAI_API_KEY", "sk-test");
  expect(hasCredentials("openai")).toBe(true);

  setEnv("GEMINI_API_KEY", undefined);
  setEnv("GOOGLE_API_KEY", "g-test");
  expect(hasCredentials("gemini")).toBe(true); // GOOGLE_API_KEY is an accepted fallback

  setEnv("AWS_ACCESS_KEY_ID", undefined);
  setEnv("AWS_PROFILE", "default");
  expect(hasCredentials("bedrock")).toBe(true);
});

test("credentialEnvFor names the variable for each backend", () => {
  expect(credentialEnvFor("openai")).toContain("OPENAI_API_KEY");
  expect(credentialEnvFor("gemini")).toContain("GEMINI_API_KEY");
  expect(credentialEnvFor("bedrock")).toContain("AWS");
});
