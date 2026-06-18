import { test, expect } from "bun:test";
import {
  AurigaError,
  BudgetExceededError,
  PolicyError,
  ValidationError,
  VerificationError,
} from "./errors";

test("AurigaError carries a code and the subclass name", () => {
  const err = new ValidationError("bad spec");
  expect(err).toBeInstanceOf(AurigaError);
  expect(err).toBeInstanceOf(Error);
  expect(err.code).toBe("validation");
  expect(err.name).toBe("ValidationError");
  expect(err.message).toBe("bad spec");
});

test("each subclass has a stable code", () => {
  expect(new PolicyError("x").code).toBe("policy");
  expect(new BudgetExceededError("x").code).toBe("budget_exceeded");
  expect(new VerificationError("x").code).toBe("verification_failed");
});

test("cause is preserved", () => {
  const cause = new Error("root");
  const err = new ValidationError("wrap", { cause });
  expect(err.cause).toBe(cause);
});
