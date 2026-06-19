import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PolicyError } from "@auriga/core";
import { LocalSandboxDriver, type Sandbox } from "@auriga/sandbox";
import {
  loadBundleFromDir,
  openDevRegistry,
  type LocalSkillRegistry,
} from "@auriga/skill-registry";
import { SkillResolver, makeSelectSkillTool } from "./skills";
import { ToolDispatcher } from "./dispatcher";

const EXAMPLE_SKILL_DIR = fileURLToPath(
  new URL("../../../skills/fix-failing-test", import.meta.url),
);

async function setup(): Promise<{
  registry: LocalSkillRegistry;
  sandbox: Sandbox;
  dir: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), "auriga-skillres-"));
  const registry = await openDevRegistry(dir);
  await registry.publish(await loadBundleFromDir(EXAMPLE_SKILL_DIR));
  const sandbox = await new LocalSandboxDriver().create({ workspace: { kind: "empty" } });
  return {
    registry,
    sandbox,
    dir,
    cleanup: async () => {
      await sandbox.destroy();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("catalog exposes metadata only (not the SKILL.md body)", async () => {
  const { registry, cleanup } = await setup();
  try {
    const resolver = new SkillResolver({
      registry,
      trustedKeys: registry.verificationKeys(),
      context: { factio: "default", role: "dev" },
    });
    const catalog = await resolver.catalogPrompt();
    expect(catalog).toContain("fix-failing-test");
    expect(catalog).toContain("Locate and fix a failing test"); // description
    expect(catalog).not.toContain("## Approach"); // body must NOT be present
  } finally {
    await cleanup();
  }
});

test("select fetches, verifies, mounts, and returns the body", async () => {
  const { registry, sandbox, cleanup } = await setup();
  try {
    const resolver = new SkillResolver({
      registry,
      trustedKeys: registry.verificationKeys(),
      context: { factio: "default", role: "dev" },
    });
    const mounted = await resolver.select(sandbox, "fix-failing-test");
    expect(mounted.skill_md).toContain("# Fix a failing test");
    expect(mounted.loaded.version).toBe("1.0.0");
    expect(mounted.loaded.content_hash.length).toBeGreaterThan(0);

    // files are on the sandbox FS
    expect(await sandbox.readFile(`${mounted.mountPath}/SKILL.md`)).toContain(
      "# Fix a failing test",
    );
    expect(await sandbox.readFile(`${mounted.mountPath}/reference/checklist.md`)).toContain(
      "checklist",
    );

    // recorded for the trace
    expect(resolver.loadedSkills()).toEqual([
      { name: "fix-failing-test", version: "1.0.0", content_hash: mounted.loaded.content_hash },
    ]);
  } finally {
    await cleanup();
  }
});

test("select enforces the permitted set (code-level gate)", async () => {
  const { registry, sandbox, cleanup } = await setup();
  try {
    const resolver = new SkillResolver({
      registry,
      trustedKeys: registry.verificationKeys(),
      context: { factio: "default", role: "dev", allowed_skills: ["something-else"] },
    });
    await expect(resolver.select(sandbox, "fix-failing-test")).rejects.toBeInstanceOf(PolicyError);
  } finally {
    await cleanup();
  }
});

test("select refuses to mount when the signature does not verify", async () => {
  const { registry, sandbox, cleanup } = await setup();
  try {
    const resolver = new SkillResolver({
      registry,
      trustedKeys: [{ key_id: registry.verificationKeys()[0]!.key_id, public_key: "AAAA" }], // wrong key
      context: { factio: "default", role: "dev" },
    });
    await expect(resolver.select(sandbox, "fix-failing-test")).rejects.toBeInstanceOf(PolicyError);
  } finally {
    await cleanup();
  }
});

test("select_skill tool returns the body and rejects disallowed names via the dispatcher", async () => {
  const { registry, sandbox, cleanup } = await setup();
  try {
    const resolver = new SkillResolver({
      registry,
      trustedKeys: registry.verificationKeys(),
      context: { factio: "default", role: "dev" },
    });
    const tool = makeSelectSkillTool(resolver, sandbox);
    const dispatcher = new ToolDispatcher([tool], ["select_skill"]);

    const ok = await dispatcher.dispatch("select_skill", { name: "fix-failing-test" });
    expect(ok.isError).toBe(false);
    expect(ok.content).toContain("# Fix a failing test");

    const denied = await dispatcher.dispatch("select_skill", { name: "ghost" });
    expect(denied.isError).toBe(true);
  } finally {
    await cleanup();
  }
});
