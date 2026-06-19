import { test, expect } from "bun:test";
import type { JobSpec } from "@auriga/core";
import { StubProvider } from "./stub";
import { costAwareRouter, singleProvider } from "./provider-router";

function spec(maxCostUsd: number): JobSpec {
  return {
    id: "j",
    factio: "default",
    created_by: "u",
    goal: "g",
    context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
    allowed_tools: [],
    acceptance_criteria: [{ kind: "file_exists", path: "x" }],
    budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: maxCostUsd, max_steps: 10 },
  };
}

test("singleProvider routes everything to one backend", () => {
  const p = new StubProvider();
  const routed = singleProvider(p, { plan: "opus", act: "haiku" }).route(spec(5));
  expect(routed.provider).toBe(p);
  expect(routed.planModel).toBe("opus");
  expect(routed.actModel).toBe("haiku");
});

test("costAwareRouter sends low-budget jobs to the cheap backend", () => {
  const strong = new StubProvider();
  const cheap = new StubProvider();
  const router = costAwareRouter({
    default: { provider: strong, plan: "opus", act: "sonnet" },
    cheap: { provider: cheap, model: "haiku" },
    cheapBelowUsd: 1,
  });

  const low = router.route(spec(0.5));
  expect(low.provider).toBe(cheap);
  expect(low.actModel).toBe("haiku");

  const high = router.route(spec(5));
  expect(high.provider).toBe(strong);
  expect(high.planModel).toBe("opus");
  expect(high.actModel).toBe("sonnet");
});
