import { describe, expect, it } from "vitest";
import { buildConfig, configToForm, type ConfigFormState } from "@/lib/config-form";

const base = (): ConfigFormState => ({
  global: "2",
  perFactio: "1",
  policies: [{ factio: "acme", roles: "dev, admin", allowedTools: "bash", allowedSkills: "" }],
  providers: [],
});

describe("configToForm", () => {
  it("renders policies + quotas as form strings", () => {
    const form = configToForm({
      policies: [{ factio: "acme", roles: ["dev"], allowed_tools: ["bash", "git"] }],
      quotas: { global: 5, perFactio: 2 },
    });
    expect(form.global).toBe("5");
    expect(form.policies[0]?.roles).toBe("dev");
    expect(form.policies[0]?.allowedTools).toBe("bash, git");
  });
});

describe("buildConfig", () => {
  it("assembles a valid config and omits empty optionals", () => {
    const { config, errors } = buildConfig(base());
    expect(errors).toEqual({});
    expect(config).toMatchObject({
      quotas: { global: 2, perFactio: 1 },
      policies: [{ factio: "acme", roles: ["dev", "admin"], allowed_tools: ["bash"] }],
    });
    const policy = (config?.policies as Array<Record<string, unknown>>)[0];
    expect(policy).not.toHaveProperty("allowed_skills");
  });

  it("rejects non-positive quotas", () => {
    const { config, errors } = buildConfig({ ...base(), global: "0" });
    expect(config).toBeUndefined();
    expect(errors.global).toBeTruthy();
  });

  it("requires a factio and at least one role per policy", () => {
    const { errors } = buildConfig({
      ...base(),
      policies: [{ factio: "", roles: "", allowedTools: "", allowedSkills: "" }],
    });
    expect(errors["policy.0"]).toBeTruthy();
  });

  it("allows an empty policy list", () => {
    const { config, errors } = buildConfig({ ...base(), policies: [] });
    expect(errors).toEqual({});
    expect(config?.policies).toEqual([]);
  });

  it("emits provider credentials: typed key set, blank kept, untouched omitted", () => {
    const { config } = buildConfig({
      ...base(),
      providers: [
        { kind: "deepseek", configured: false, apiKey: "sk-new", baseURL: "" },
        { kind: "openai", configured: true, apiKey: "", baseURL: "" }, // configured → sent (key kept)
        { kind: "gemini", configured: false, apiKey: "", baseURL: "" }, // untouched → omitted
        { kind: "bedrock", configured: false, apiKey: "ignored", baseURL: "" }, // read-only → omitted
      ],
    });
    const providers = config?.providers as Record<string, { apiKey?: string }>;
    expect(providers.deepseek).toEqual({ apiKey: "sk-new" });
    expect(providers.openai).toEqual({}); // present but no key → server preserves stored key
    expect(providers).not.toHaveProperty("gemini");
    expect(providers).not.toHaveProperty("bedrock");
  });
});

describe("configToForm providers", () => {
  it("reflects the redacted GET (configured + baseURL, never the key)", () => {
    const form = configToForm({
      policies: [],
      quotas: { global: 1, perFactio: 1 },
      providers: { deepseek: { configured: true, baseURL: "https://api.deepseek.com" } },
    });
    const ds = form.providers.find((p) => p.kind === "deepseek");
    expect(ds).toMatchObject({ configured: true, baseURL: "https://api.deepseek.com", apiKey: "" });
    const openai = form.providers.find((p) => p.kind === "openai");
    expect(openai).toMatchObject({ configured: false, apiKey: "" });
  });
});
