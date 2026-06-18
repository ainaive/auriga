import { test, expect } from "bun:test";
import type { JobSpec } from "@auriga/core";
import { reasoningSandwich, staticRouter } from "./router";

const spec = { id: "j" } as JobSpec;

test("staticRouter uses one model for plan and act", () => {
  expect(staticRouter("m").route(spec)).toEqual({ plan: "m", act: "m" });
});

test("reasoningSandwich plans strong, acts fast", () => {
  expect(reasoningSandwich("opus", "haiku").route(spec)).toEqual({ plan: "opus", act: "haiku" });
});
