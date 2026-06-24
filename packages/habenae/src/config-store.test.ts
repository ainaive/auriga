import { test, expect } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  FileConfigStore,
  InMemoryConfigStore,
  mergeProviderSecrets,
  parseConfig,
  redactConfig,
  StoreBackedPolicy,
} from "./config-store";

test("FileConfigStore: defaults when absent, round-trips a write, persists to disk", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auriga-cfg-"));
  try {
    const store = await FileConfigStore.open(dir);
    expect(await store.get()).toEqual(DEFAULT_CONFIG);

    const next = {
      policies: [
        { factio: "default", roles: ["dev", "admin", "viewer"] },
        { factio: "acme", roles: ["dev"], allowed_tools: ["read_file"] },
      ],
      quotas: { global: 5, perFactio: 2 },
    };
    await store.set(next);
    expect(await store.get()).toEqual(next);

    // A fresh store reads the persisted file.
    const reopened = await FileConfigStore.open(dir);
    expect(await reopened.get()).toEqual(next);
    const onDisk = JSON.parse(await readFile(join(dir, "config.json"), "utf8"));
    expect(onDisk.quotas.global).toBe(5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("StoreBackedPolicy reflects the store's current policies (live)", async () => {
  const store = new InMemoryConfigStore();
  const policy = new StoreBackedPolicy(store);
  expect(policy.forFactio("default")?.roles).toContain("admin");
  expect(policy.forFactio("acme")).toBeUndefined();

  await store.set({
    policies: [{ factio: "acme", roles: ["dev"] }],
    quotas: { global: 1, perFactio: 1 },
  });
  expect(policy.forFactio("acme")?.roles).toEqual(["dev"]);
  expect(policy.forFactio("default")).toBeUndefined();
});

test("parseConfig rejects an invalid shape", () => {
  expect(() => parseConfig({ policies: [], quotas: { global: 0, perFactio: 1 } })).toThrow();
  expect(() =>
    parseConfig({ policies: [{ roles: [] }], quotas: { global: 1, perFactio: 1 } }),
  ).toThrow();
});

test("parseConfig rejects duplicate factio entries", () => {
  expect(() =>
    parseConfig({
      policies: [
        { factio: "a", roles: ["dev"] },
        { factio: "a", roles: ["admin"] },
      ],
      quotas: { global: 1, perFactio: 1 },
    }),
  ).toThrow();
});

test("FileConfigStore.open throws on a present-but-invalid file (not a silent default)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auriga-cfg-bad-"));
  try {
    await writeFile(join(dir, "config.json"), "{ not valid json");
    await expect(FileConfigStore.open(dir)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("get()/current() return clones (callers can't mutate internal state)", async () => {
  const store = new InMemoryConfigStore();
  const got = await store.get();
  got.quotas.global = 999;
  expect((await store.get()).quotas.global).toBe(2); // unchanged
});

test("FileConfigStore encrypts provider apiKeys at rest and decrypts on reopen", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auriga-cfg-sec-"));
  try {
    const store = await FileConfigStore.open(dir, { secret: "master" });
    await store.set({
      policies: [{ factio: "default", roles: ["admin"] }],
      quotas: { global: 1, perFactio: 1 },
      providers: { deepseek: { apiKey: "sk-deepseek-xyz", baseURL: "https://api.deepseek.com" } },
    });
    // In-memory holds plaintext; on-disk holds ciphertext (no plaintext key).
    expect((await store.get()).providers?.deepseek?.apiKey).toBe("sk-deepseek-xyz");
    const rawDisk = await readFile(join(dir, "config.json"), "utf8");
    expect(rawDisk).not.toContain("sk-deepseek-xyz");
    expect(rawDisk).toContain("apiKeyEnc");
    expect(rawDisk).toContain("https://api.deepseek.com"); // baseURL stays plaintext

    // Reopen with the same secret decrypts back to the plaintext key.
    const reopened = await FileConfigStore.open(dir, { secret: "master" });
    expect((await reopened.get()).providers?.deepseek?.apiKey).toBe("sk-deepseek-xyz");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("FileConfigStore refuses to store a provider key without a master secret (fail closed)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auriga-cfg-nokey-"));
  try {
    const store = await FileConfigStore.open(dir, { secret: undefined });
    await expect(
      store.set({
        policies: [{ factio: "default", roles: ["admin"] }],
        quotas: { global: 1, perFactio: 1 },
        providers: { openai: { apiKey: "sk-openai" } },
      }),
    ).rejects.toThrow("AURIGA_CONFIG_SECRET");
    // A baseURL-only provider (no secret) is allowed without a master key.
    await store.set({
      policies: [{ factio: "default", roles: ["admin"] }],
      quotas: { global: 1, perFactio: 1 },
      providers: { deepseek: { baseURL: "https://gw.example.com/v1" } },
    });
    expect((await store.get()).providers?.deepseek?.baseURL).toBe("https://gw.example.com/v1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("redactConfig drops apiKeys but keeps configured + baseURL", () => {
  const redacted = redactConfig({
    policies: [{ factio: "default", roles: ["admin"] }],
    quotas: { global: 1, perFactio: 1 },
    providers: {
      deepseek: { apiKey: "sk-secret", baseURL: "https://api.deepseek.com" },
      openai: { baseURL: "https://x" },
    },
  });
  expect(JSON.stringify(redacted)).not.toContain("sk-secret");
  expect(redacted.providers?.deepseek).toEqual({
    configured: true,
    baseURL: "https://api.deepseek.com",
  });
  expect(redacted.providers?.openai).toEqual({ configured: false, baseURL: "https://x" });
});

test("mergeProviderSecrets keeps, replaces, and clears keys correctly", () => {
  const current = {
    policies: [{ factio: "default", roles: ["admin"] }],
    quotas: { global: 1, perFactio: 1 },
    providers: {
      deepseek: { apiKey: "old-ds" },
      openai: { apiKey: "old-oa" },
      zhipu: { apiKey: "old-zp" },
    },
  };
  const merged = mergeProviderSecrets(
    {
      policies: current.policies,
      quotas: current.quotas,
      providers: {
        deepseek: {}, // apiKey undefined → keep
        openai: { apiKey: "new-oa" }, // replace
        zhipu: { apiKey: "" }, // clear
      },
    },
    current,
  );
  expect(merged.providers?.deepseek?.apiKey).toBe("old-ds");
  expect(merged.providers?.openai?.apiKey).toBe("new-oa");
  expect(merged.providers?.zhipu).toBeUndefined(); // cleared + dropped
});
