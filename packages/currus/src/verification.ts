import type { AcceptanceCriterion } from "@auriga/core";
import type { Sandbox } from "@auriga/sandbox";
import { truncate } from "./tools/util";

export interface CriterionResult {
  criterion: AcceptanceCriterion;
  passed: boolean;
  /** Human-readable evidence: exit codes, output tails, or the failure reason. */
  evidence: string;
}

export interface VerificationResult {
  passed: boolean;
  results: CriterionResult[];
}

/** A pluggable verifier referenced by `named_check` criteria. */
export type NamedCheck = (sandbox: Sandbox) => Promise<{ passed: boolean; evidence: string }>;

/**
 * The mandatory quality gate: a job cannot reach `done` unless every acceptance
 * criterion passes here. Criteria are decidable — a command's exit code, a file's
 * existence, or a registered named check — never the model's opinion.
 */
export class VerificationGate {
  constructor(
    private readonly namedChecks: Record<string, NamedCheck> = {},
    private readonly opts: { timeoutMs?: number } = {},
  ) {}

  async verify(
    sandbox: Sandbox,
    criteria: readonly AcceptanceCriterion[],
  ): Promise<VerificationResult> {
    const results: CriterionResult[] = [];
    for (const criterion of criteria) {
      results.push(await this.check(sandbox, criterion));
    }
    return { passed: results.length > 0 && results.every((r) => r.passed), results };
  }

  private async check(sandbox: Sandbox, criterion: AcceptanceCriterion): Promise<CriterionResult> {
    switch (criterion.kind) {
      case "command": {
        const r = await sandbox.exec(
          criterion.cmd,
          this.opts.timeoutMs !== undefined ? { timeoutMs: this.opts.timeoutMs } : {},
        );
        const passed = r.exitCode === criterion.expect_exit && !r.timedOut;
        const evidence =
          `\`${criterion.cmd}\` → exit ${r.exitCode} (expected ${criterion.expect_exit})` +
          `${r.timedOut ? " [timed out]" : ""}\n${truncate(tail(`${r.stdout}${r.stderr}`))}`;
        return { criterion, passed, evidence };
      }
      case "file_exists": {
        const passed = await sandbox.exists(criterion.path);
        return {
          criterion,
          passed,
          evidence: passed ? `${criterion.path} exists` : `${criterion.path} is missing`,
        };
      }
      case "named_check": {
        const check = this.namedChecks[criterion.name];
        if (!check) {
          return { criterion, passed: false, evidence: `named check not registered: ${criterion.name}` };
        }
        const { passed, evidence } = await check(sandbox);
        return { criterion, passed, evidence };
      }
    }
  }
}

function tail(s: string, lines = 40): string {
  const arr = s.split("\n");
  return arr.length <= lines ? s : arr.slice(-lines).join("\n");
}
