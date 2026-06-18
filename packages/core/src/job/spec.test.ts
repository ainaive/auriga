import { test, expect } from "bun:test";
import { z } from "zod";
import { JobSpecSchema, parseJobSpec, type JobSpec } from "./spec";
import { ValidationError } from "../errors";

const validSpec: JobSpec = {
  id: "job_abc",
  factio: "default",
  created_by: "huziyong@gmail.com",
  goal: "Make the failing test pass",
  context_refs: {
    workspace: { kind: "git", url_or_path: "/repo" },
  },
  allowed_tools: ["file", "bash", "git"],
  acceptance_criteria: [{ kind: "command", cmd: "bun test", expect_exit: 0 }],
  budget: { max_tokens: 100_000, max_wall_time_s: 600, max_cost_usd: 5, max_steps: 50 },
};

test("a valid JobSpec parses", () => {
  const spec = parseJobSpec(validSpec);
  expect(spec.id).toBe("job_abc");
  expect(spec.acceptance_criteria[0]?.kind).toBe("command");
});

test("missing acceptance_criteria is rejected", () => {
  const { acceptance_criteria: _omit, ...rest } = validSpec;
  expect(() => parseJobSpec(rest)).toThrow(ValidationError);
});

test("empty acceptance_criteria is rejected", () => {
  expect(() => parseJobSpec({ ...validSpec, acceptance_criteria: [] })).toThrow(ValidationError);
});

test("non-positive budget is rejected", () => {
  expect(() =>
    parseJobSpec({ ...validSpec, budget: { ...validSpec.budget, max_tokens: 0 } }),
  ).toThrow(ValidationError);
});

test("unknown acceptance criterion kind is rejected", () => {
  expect(() =>
    parseJobSpec({ ...validSpec, acceptance_criteria: [{ kind: "magic" }] }),
  ).toThrow(ValidationError);
});

test("JobSpec emits a JSON schema covering the core fields", () => {
  const json = z.toJSONSchema(JobSpecSchema, { target: "draft-2020-12" }) as {
    type?: string;
    properties?: Record<string, unknown>;
  };
  expect(json.type).toBe("object");
  expect(Object.keys(json.properties ?? {})).toEqual(
    expect.arrayContaining(["id", "factio", "goal", "acceptance_criteria", "budget"]),
  );
});
