import { test, expect } from "bun:test";
import { estimateCostUsd, formatUsage } from "./cost";

test("estimateCostUsd uses per-million pricing", () => {
  // sonnet: $3/M in, $15/M out
  const cost = estimateCostUsd("claude-sonnet-4-6", {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  expect(cost).toBeCloseTo(18, 5);
});

test("unknown model has unknown (NaN) cost, not zero", () => {
  expect(estimateCostUsd("mystery", { input_tokens: 10, output_tokens: 10 })).toBeNaN();
});

test("formatUsage shows tokens and cost, or n/a without a model", () => {
  expect(
    formatUsage("claude-haiku-4-5-20251001", { input_tokens: 1000, output_tokens: 0 }),
  ).toContain("in=1000");
  expect(formatUsage(null, { input_tokens: 1, output_tokens: 1 })).toContain("cost n/a");
});
