import { test, expect } from "bun:test";
import { assertTransition, canTransition, isTerminal, JOB_STATES } from "./lifecycle";
import { ValidationError } from "../errors";

test("happy-path transitions are allowed", () => {
  expect(canTransition("pending", "planning")).toBe(true);
  expect(canTransition("planning", "running")).toBe(true);
  expect(canTransition("running", "verifying")).toBe(true);
  expect(canTransition("verifying", "done")).toBe(true);
});

test("verifying can loop back to running on failure", () => {
  expect(canTransition("verifying", "running")).toBe(true);
});

test("terminal states cannot transition out", () => {
  expect(canTransition("done", "running")).toBe(false);
  expect(canTransition("failed", "planning")).toBe(false);
  expect(isTerminal("done")).toBe(true);
  expect(isTerminal("failed")).toBe(true);
  expect(isTerminal("running")).toBe(false);
});

test("illegal transition throws ValidationError", () => {
  expect(() => assertTransition("pending", "done")).toThrow(ValidationError);
});

test("a legal transition does not throw", () => {
  expect(() => assertTransition("running", "verifying")).not.toThrow();
});

test("every state has a transition entry", () => {
  for (const state of JOB_STATES) {
    expect(() => canTransition(state, "failed")).not.toThrow();
  }
});
