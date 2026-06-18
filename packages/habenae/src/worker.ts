import type { ModelProvider, SkillRegistry, SkillUsageSink, VerificationKey } from "@auriga/core";
import { Recorder, traceCost } from "@auriga/capella";
import { runJob, type JobEvent, type RunJobResult } from "@auriga/currus";
import type { ModelRouter } from "@auriga/provider";
import type { CreateSandboxOptions, SandboxDriver } from "@auriga/sandbox";
import type { JobStore, WorkerCheckpoint } from "./types";

export interface WorkerOptions {
  store: JobStore;
  provider: ModelProvider;
  /** Default model when no router is given. */
  model: string;
  sandboxDriver: SandboxDriver;
  /** Per-job model routing (reasoning sandwich). Falls back to `model`. */
  router?: ModelRouter;
  registry?: SkillRegistry;
  trustedKeys?: VerificationKey[];
  /** Runtime → governance feedback sink for per-skill usage/success/cost. */
  usageSink?: SkillUsageSink;
  role?: string;
  maxAttempts?: number;
  /** Progress hook (forwarded from the runner) for live CLI/console feedback. */
  onEvent?: (event: JobEvent) => void;
  /** Test hook: throw after the checkpoint for this attempt is saved (simulate a crash). */
  crashAfterAttempt?: number;
}

/**
 * Pulls a job from the store, runs it via Currus inside an ephemeral sandbox, and
 * checkpoints after each PEV attempt (transcript + budget + workspace snapshot).
 * A fresh Worker can resume a job from its last checkpoint — the workspace is
 * restored from the snapshot and the conversation continues.
 */
export class Worker {
  constructor(private readonly opts: WorkerOptions) {}

  async run(jobId: string): Promise<RunJobResult> {
    const { store } = this.opts;
    const record = await store.get(jobId);
    if (!record) throw new Error(`job not found: ${jobId}`);

    // Per-job model routing (reasoning sandwich): a planning model + an act model.
    const routed = this.opts.router?.route(record.spec);
    const model = routed?.act ?? this.opts.model;
    const planModel = routed?.plan;

    // HITL "pause first": short-circuit unapproved jobs BEFORE creating a sandbox,
    // so no resources are spent (and workspace seeding can't fail) before approval.
    if (record.spec.require_approval && !record.approved) {
      const reason = "awaiting human approval";
      await store.update(jobId, { state: "paused", reason, model });
      await store.saveTrace(
        new Recorder(jobId, model).finish({
          state: "paused",
          reason,
          attempts: 0,
          steps: 0,
          usage: { input_tokens: 0, output_tokens: 0 },
          loaded_skills: [],
        }),
      );
      return {
        state: "paused",
        reason,
        attempts: 0,
        steps: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
        verification: null,
        loadedSkills: [],
        messages: [],
      };
    }

    const checkpoint = await store.loadCheckpoint(jobId);
    const sandbox = await this.opts.sandboxDriver.create(seedFor(record, checkpoint));
    const recorder = new Recorder(jobId, model);

    try {
      await store.update(jobId, { state: checkpoint ? "running" : "planning", model });
      const result = await runJob({
        spec: record.spec,
        provider: this.opts.provider,
        model,
        ...(planModel ? { planModel } : {}),
        sandbox,
        onTrace: recorder.record,
        approvalGate: { isApproved: async () => (await store.get(jobId))?.approved ?? false },
        ...(this.opts.registry ? { registry: this.opts.registry } : {}),
        ...(this.opts.trustedKeys ? { trustedKeys: this.opts.trustedKeys } : {}),
        ...(this.opts.role ? { role: this.opts.role } : {}),
        ...(this.opts.maxAttempts !== undefined ? { maxAttempts: this.opts.maxAttempts } : {}),
        ...(this.opts.onEvent ? { onEvent: this.opts.onEvent } : {}),
        ...(checkpoint
          ? {
              resume: {
                messages: checkpoint.messages,
                usage: checkpoint.usage,
                steps: checkpoint.steps,
                startAttempt: checkpoint.next_attempt,
              },
            }
          : {}),
        onAttempt: async (info) => {
          const snapshot = await sandbox.snapshot();
          const cp: WorkerCheckpoint = {
            job_id: jobId,
            lifecycle_state: info.passed ? "verifying" : "running",
            messages: info.messages,
            usage: info.usage,
            steps: info.steps,
            next_attempt: info.attempt + 1,
            loaded_skills: info.loadedSkills,
            workspace: snapshot,
          };
          await store.saveCheckpoint(cp);
          await store.update(jobId, {
            state: info.passed ? "verifying" : "running",
            usage: info.usage,
            attempts: info.attempt,
            steps: info.steps,
            loaded_skills: info.loadedSkills,
          });
          if (this.opts.crashAfterAttempt === info.attempt) {
            throw new Error(`simulated worker crash after attempt ${info.attempt}`);
          }
        },
      });

      const trace = recorder.finish({
        state: result.state,
        reason: result.reason,
        attempts: result.attempts,
        steps: result.steps,
        usage: result.usage,
        loaded_skills: result.loadedSkills,
      });
      await store.saveTrace(trace);
      await store.update(jobId, {
        state: result.state,
        reason: result.reason,
        usage: result.usage,
        attempts: result.attempts,
        steps: result.steps,
        loaded_skills: result.loadedSkills,
      });

      // Runtime → governance feedback: attribute the job's cost across the skills
      // it used, recording success/failure per skill.
      if (this.opts.usageSink && result.state !== "paused" && result.loadedSkills.length > 0) {
        const total = traceCost(trace).cost_usd;
        const perSkill = Number.isFinite(total) ? total / result.loadedSkills.length : 0;
        for (const skill of result.loadedSkills) {
          await this.opts.usageSink.recordUsage(skill.name, skill.version, {
            success: result.state === "done",
            cost_usd: perSkill,
          });
        }
      }
      return result;
    } finally {
      await sandbox.destroy();
    }
  }
}

function seedFor(
  record: { spec: { context_refs: { workspace: { kind: string; url_or_path: string } } } },
  checkpoint: WorkerCheckpoint | undefined,
): CreateSandboxOptions {
  if (checkpoint) {
    return { workspace: { kind: "snapshot", snapshot: checkpoint.workspace } };
  }
  const ws = record.spec.context_refs.workspace;
  if (ws.kind === "dir") {
    return { workspace: { kind: "dir", path: ws.url_or_path } };
  }
  // "git" requires a clone step (not yet implemented); fail fast rather than
  // silently running against an empty workspace.
  throw new Error(`unsupported workspace kind for worker seeding: ${ws.kind}`);
}
