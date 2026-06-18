/**
 * Typed error hierarchy for Auriga. Every error carries a stable `code` for
 * logging, metrics, and control-plane decisions (retry vs. fail vs. pause).
 */

export class AurigaError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** A value failed schema/contract validation. */
export class ValidationError extends AurigaError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("validation", message, options);
  }
}

/** A code-level policy/permission/governance check denied an action. */
export class PolicyError extends AurigaError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("policy", message, options);
  }
}

/** A job exceeded one of its budget limits (tokens / time / cost / steps). */
export class BudgetExceededError extends AurigaError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("budget_exceeded", message, options);
  }
}

/** The verification gate did not pass; the job cannot be marked done. */
export class VerificationError extends AurigaError {
  constructor(message: string, options?: { cause?: unknown }) {
    super("verification_failed", message, options);
  }
}
