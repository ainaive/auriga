import { test, expect } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_CONFIG,
  FileConfigStore,
  InMemoryConfigStore,
  parseConfig,
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
