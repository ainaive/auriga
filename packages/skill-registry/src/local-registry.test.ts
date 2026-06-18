import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyArtifact } from "@auriga/core";
import { loadBundleFromDir } from "./bundle";
import { openDevRegistry } from "./local-registry";

const EXAMPLE_SKILL_DIR = fileURLToPath(
  new URL("../../../skills/fix-failing-test", import.meta.url),
);

async function tmpRegistry() {
  const dir = await mkdtemp(join(tmpdir(), "auriga-skills-"));
  const registry = await openDevRegistry(dir);
  return {
    registry,
    dir,
    [Symbol.asyncDispose]: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("publish → resolve → fetch → verify round trip", async () => {
  await using ctx = await tmpRegistry();
  const bundle = await loadBundleFromDir(EXAMPLE_SKILL_DIR);
  await ctx.registry.publish(bundle);

  const metas = await ctx.registry.resolve({ factio: "default", role: "dev" });
  const meta = metas.find((m) => m.name === "fix-failing-test");
  expect(meta).toBeDefined();
  expect(meta?.version).toBe("1.0.0");
  expect(meta?.type).toBe("knowledge");

  const artifact = await ctx.registry.fetch("fix-failing-test", "1.0.0");
  expect(artifact.manifest.files.length).toBeGreaterThan(0);
  expect(await verifyArtifact(artifact, ctx.registry.verificationKeys())).toEqual({ ok: true });
});

test("resolve honors the allowed_skills filter", async () => {
  await using ctx = await tmpRegistry();
  await ctx.registry.publish(await loadBundleFromDir(EXAMPLE_SKILL_DIR));
  const filtered = await ctx.registry.resolve({
    factio: "default",
    role: "dev",
    allowed_skills: ["some-other-skill"],
  });
  expect(filtered).toHaveLength(0);
});

test("a tampered fetched artifact fails verification", async () => {
  await using ctx = await tmpRegistry();
  await ctx.registry.publish(await loadBundleFromDir(EXAMPLE_SKILL_DIR));
  const artifact = await ctx.registry.fetch("fix-failing-test", "1.0.0");
  const tampered = { ...artifact, skill_md: `${artifact.skill_md}\n<!-- malicious -->` };
  const result = await verifyArtifact(tampered, ctx.registry.verificationKeys());
  expect(result.ok).toBe(false);
});

test("fetch throws for a missing skill", async () => {
  await using ctx = await tmpRegistry();
  await expect(ctx.registry.fetch("nope", "9.9.9")).rejects.toThrow();
});
