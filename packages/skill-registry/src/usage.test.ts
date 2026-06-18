import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDevRegistry } from "./local-registry";

test("recordUsage aggregates uses, successes, and cost", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auriga-usage-"));
  try {
    const registry = await openDevRegistry(dir);
    expect(await registry.stats("fix-failing-test")).toEqual({
      name: "fix-failing-test",
      uses: 0,
      successes: 0,
      total_cost_usd: 0,
    });

    await registry.recordUsage("fix-failing-test", "1.0.0", { success: true, cost_usd: 0.01 });
    await registry.recordUsage("fix-failing-test", "1.0.0", { success: false, cost_usd: 0.02 });

    const stats = await registry.stats("fix-failing-test");
    expect(stats.uses).toBe(2);
    expect(stats.successes).toBe(1);
    expect(stats.total_cost_usd).toBeCloseTo(0.03, 6);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
