import type { ModelProvider, SkillRegistry, VerificationKey } from "@auriga/core";
import { Recorder } from "@auriga/capella";
import { runJob, type JobEvent, type RunJobResult } from "@auriga/currus";
import type { CreateSandboxOptions, SandboxDriver } from "@auriga/sandbox";
import type { JobStore, WorkerCheckpoint } from "./types";

export interface WorkerOptions {
  store: JobStore;
  provider: ModelProvider;
  model: string;
  sandboxDriver: SandboxDriver;
  registry?: SkillRegistry;
  trustedKeys?: VerificationKey[];
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

    const checkpoint = await store.loadCheckpoint(jobId);
    const sandbox = await this.opts.sandboxDriver.create(seedFor(record, checkpoint));
    const recorder = new Recorder(jobId, this.opts.model);

    try {
      await store.update(jobId, { state: checkpoint ? "running" : "planning", model: this.opts.model });
      const result = await runJob({
        spec: record.spec,
        provider: this.opts.provider,
        model: this.opts.model,
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

      await store.saveTrace(
        recorder.finish({
          state: result.state,
          reason: result.reason,
          attempts: result.attempts,
          steps: result.steps,
          usage: result.usage,
          loaded_skills: result.loadedSkills,
        }),
      );
      await store.update(jobId, {
        state: result.state,
        reason: result.reason,
        usage: result.usage,
        attempts: result.attempts,
        steps: result.steps,
        loaded_skills: result.loadedSkills,
      });
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
