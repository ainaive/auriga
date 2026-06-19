import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBundleFromDir } from "./bundle";
import { openDevRegistry } from "./local-registry";
import { searchSkills } from "./marketplace";

const EXAMPLE_SKILL_DIR = fileURLToPath(new URL("../../../skills/fix-failing-test", import.meta.url));

test("searchSkills joins metadata with stats, ranks by adoption, and filters by query", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auriga-market-"));
  try {
    const registry = await openDevRegistry(dir);
    await registry.publish(await loadBundleFromDir(EXAMPLE_SKILL_DIR));
    await registry.publish({
      name: "lint",
      version: "1.0.0",
      description: "Lint the codebase.",
      type: "knowledge",
      skill_md: "# lint",
      files: [],
    });

    // give fix-failing-test more adoption
    await registry.recordUsage("fix-failing-test", "1.0.0", { success: true, cost_usd: 0.01 });
    await registry.recordUsage("fix-failing-test", "1.0.0", { success: true, cost_usd: 0.01 });

    const deps = { registry, stats: registry };
    const all = await searchSkills(deps, { factio: "default", role: "dev" });
    expect(all.map((e) => e.name)).toEqual(["fix-failing-test", "lint"]); // ranked by uses
    expect(all[0]?.stats.uses).toBe(2);

    const filtered = await searchSkills(deps, { factio: "default", role: "dev" }, { query: "lint" });
    expect(filtered.map((e) => e.name)).toEqual(["lint"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
