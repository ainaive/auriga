import { test, expect } from "bun:test";
import type { JobSpec } from "@auriga/core";
import { InMemoryAuditLog } from "./audit";
import { buildDashboard } from "./dashboard";
import { InMemoryJobStore } from "./memory-store";

function spec(id: string, factio: string): JobSpec {
  return {
    id,
    factio,
    created_by: "u",
    goal: "g",
    context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
    allowed_tools: [],
    acceptance_criteria: [{ kind: "file_exists", path: "x" }],
    budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
  };
}

test("buildDashboard rolls up per-tenant counts, states, and cost + recent audit", async () => {
  const store = new InMemoryJobStore();
  const audit = new InMemoryAuditLog();

  await store.create(spec("a1", "t1"));
  await store.create(spec("a2", "t1"));
  await store.create(spec("b1", "t2"));
  await store.update("a1", {
    state: "done",
    model: "claude-sonnet-4-6",
    usage: { input_tokens: 1_000_000, output_tokens: 0 },
  });
  await store.update("a2", { state: "failed" });
  await store.update("b1", { state: "running" });
  await audit.record({ factio: "t1", actor: "worker", action: "job.completed", job_id: "a1" });

  const dash = await buildDashboard({ store, audit });

  expect(dash.totals.jobs).toBe(3);
  expect(dash.totals.tenants).toBe(2);
  expect(dash.totals.cost_usd).toBeCloseTo(3, 5); // sonnet $3 / 1M input

  const t1 = dash.tenants.find((t) => t.factio === "t1");
  expect(t1?.total).toBe(2);
  expect(t1?.byState).toEqual({ done: 1, failed: 1 });
  expect(t1?.cost_usd).toBeCloseTo(3, 5);

  expect(dash.recentAudit[0]?.action).toBe("job.completed");
});
