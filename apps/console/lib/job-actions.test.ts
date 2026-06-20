import { describe, expect, it } from "vitest";
import { jobActions } from "@/lib/job-actions";
import type { JobState } from "@/lib/types";

const make = (state: JobState, opts: { approved?: boolean; require_approval?: boolean } = {}) =>
  jobActions({ state, approved: opts.approved ?? false, spec: { require_approval: opts.require_approval } });

describe("jobActions", () => {
  it("pending → runnable + cancellable; not pausable; no approval", () => {
    expect(make("pending")).toMatchObject({
      runnable: true,
      pausable: false,
      cancellable: true,
      needsApproval: false,
    });
  });

  it("running → pausable + cancellable; not runnable", () => {
    expect(make("running")).toMatchObject({
      active: true,
      runnable: false,
      pausable: true,
      cancellable: true,
    });
  });

  it("done → nothing actionable", () => {
    expect(make("done")).toMatchObject({
      terminal: true,
      runnable: false,
      pausable: false,
      cancellable: false,
    });
  });

  it("failed / cancelled → re-runnable", () => {
    expect(make("failed").runnable).toBe(true);
    expect(make("cancelled").runnable).toBe(true);
  });

  it("paused awaiting approval → needsApproval; not runnable/resumable", () => {
    expect(make("paused", { require_approval: true, approved: false })).toMatchObject({
      needsApproval: true,
      runnable: false,
      resumable: false,
    });
  });

  it("paused by user (no gate, or approved) → resumable + runnable", () => {
    expect(make("paused")).toMatchObject({ needsApproval: false, resumable: true, runnable: true });
    expect(make("paused", { require_approval: true, approved: true })).toMatchObject({
      needsApproval: false,
      resumable: true,
    });
  });
});
