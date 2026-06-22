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

test("prices non-Anthropic provider models", () => {
  // gpt-4o: $2.5/M in, $10/M out
  expect(
    estimateCostUsd("gpt-4o", { input_tokens: 1_000_000, output_tokens: 1_000_000 }),
  ).toBeCloseTo(12.5, 5);
  // Bedrock cross-region inference-profile id is priced under its full id.
  expect(
    estimateCostUsd("us.anthropic.claude-3-5-sonnet-20241022-v2:0", {
      input_tokens: 1_000_000,
      output_tokens: 0,
    }),
  ).toBeCloseTo(3, 5);
});

test("unknown model has unknown (NaN) cost, not zero", () => {
  expect(estimateCostUsd("mystery", { input_tokens: 10, output_tokens: 10 })).toBeNaN();
  // An unlisted Bedrock model id is also unknown, not free.
  expect(
    estimateCostUsd("meta.llama3-1-70b-instruct-v1:0", { input_tokens: 10, output_tokens: 10 }),
  ).toBeNaN();
});

test("formatUsage shows tokens and cost, or n/a without a model", () => {
  expect(
    formatUsage("claude-haiku-4-5-20251001", { input_tokens: 1000, output_tokens: 0 }),
  ).toContain("in=1000");
  expect(formatUsage(null, { input_tokens: 1, output_tokens: 1 })).toContain("cost n/a");
});
