import type {
  JobLiveEvent,
  ModelProvider,
  SkillRegistry,
  SkillUsageSink,
  TraceEvent,
  VerificationKey,
} from "@auriga/core";
import { Recorder, estimateCostUsd } from "@auriga/capella";
import { runJob, type JobEvent, type RunJobResult } from "@auriga/currus";
import type { ModelRouter, ProviderRouter } from "@auriga/provider";
import type { CreateSandboxOptions, SandboxDriver } from "@auriga/sandbox";
import { safeAudit, type AuditLog } from "./audit";
import type { EventBus } from "./event-bus";
import type { JobStore, WorkerCheckpoint } from "./types";

const STATE_ACTION: Record<string, string> = {
  done: "job.completed",
  failed: "job.failed",
  paused: "job.paused",
  cancelled: "job.cancelled",
};

export interface WorkerOptions {
  store: JobStore;
  provider: ModelProvider;
  /** Default model when no router is given. */
  model: string;
  sandboxDriver: SandboxDriver;
  /** Per-job model routing (reasoning sandwich). Falls back to `model`. */
  router?: ModelRouter;
  /** Per-job backend routing (provider + models). Takes precedence over `router`. */
  providerRouter?: ProviderRouter;
  registry?: SkillRegistry;
  trustedKeys?: VerificationKey[];
  /** Runtime → governance feedback sink for per-skill usage/success/cost. */
  usageSink?: SkillUsageSink;
  /** Optional audit trail for job lifecycle events. */
  audit?: AuditLog;
  /** Optional live event bus: publishes state/trace/progress/done for browsers watching the run. */
  bus?: EventBus;
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

    // Per-job routing: a backend provider (providerRouter) + plan/act models.
    // providerRouter wins; else the model router; else the worker defaults.
    const exec = this.opts.providerRouter?.route(record.spec);
    const routed = this.opts.router?.route(record.spec);
    const provider = exec?.provider ?? this.opts.provider;
    const model = exec?.actModel ?? routed?.act ?? this.opts.model;
    const planModel = exec?.planModel ?? routed?.plan;

    // Live event publishing (no-op when no bus is wired). Fire-and-forget so a slow
    // or failing subscriber never blocks or breaks the run; the in-memory bus assigns
    // `seq` synchronously, so call order is preserved.
    const bus = this.opts.bus;
    const publish = (data: JobLiveEvent): void => {
      if (!bus) return;
      void bus
        .publish({ job_id: jobId, factio: record.spec.factio, data })
        .catch((err) =>
          console.warn(
            `[auriga] event publish failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    };

    // HITL "pause first": short-circuit unapproved jobs BEFORE creating a sandbox,
    // so no resources are spent (and workspace seeding can't fail) before approval.
    if (record.spec.require_approval && !record.approved) {
      const reason = "awaiting human approval";
      await store.update(jobId, { state: "paused", reason, model });
      publish({ kind: "state", state: "paused", reason });
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
      await safeAudit(this.opts.audit, {
        factio: record.spec.factio,
        actor: "worker",
        action: "job.paused",
        job_id: jobId,
      });
      publish({ kind: "done", state: "paused", reason });
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
    // Tee the trace: each event is buffered for the sealed trace (finish()) AND
    // published live so a browser can render the step timeline as it happens.
    const onTrace = (event: TraceEvent): void => {
      recorder.record(event);
      publish({ kind: "trace", event });
    };
    // Forward the progress hook AND publish a live progress+cost envelope.
    const onEvent = (event: JobEvent): void => {
      this.opts.onEvent?.(event);
      if (event.type === "attempt") {
        const cost = estimateCostUsd(model, event.usage);
        publish({
          kind: "progress",
          attempt: event.attempt,
          steps: event.steps,
          usage: event.usage,
          cost_usd: Number.isFinite(cost) ? cost : 0,
        });
      }
    };

    try {
      await store.update(jobId, { state: checkpoint ? "running" : "planning", model });
      publish({ kind: "state", state: checkpoint ? "running" : "planning", reason: null });
      const result = await runJob({
        spec: record.spec,
        provider,
        model,
        ...(planModel ? { planModel } : {}),
        sandbox,
        onTrace,
        approvalGate: { isApproved: async () => (await store.get(jobId))?.approved ?? false },
        cancellationGate: {
          isCancelled: async () => (await store.get(jobId))?.cancel_requested ?? false,
        },
        pauseGate: {
          isPaused: async () => (await store.get(jobId))?.pause_requested ?? false,
        },
        ...(this.opts.registry ? { registry: this.opts.registry } : {}),
        ...(this.opts.trustedKeys ? { trustedKeys: this.opts.trustedKeys } : {}),
        ...(this.opts.role ? { role: this.opts.role } : {}),
        ...(this.opts.maxAttempts !== undefined ? { maxAttempts: this.opts.maxAttempts } : {}),
        onEvent,
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
          publish({ kind: "state", state: info.passed ? "verifying" : "running", reason: null });
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
      publish({ kind: "state", state: result.state, reason: result.reason });
      await safeAudit(this.opts.audit, {
        factio: record.spec.factio,
        actor: "worker",
        action: STATE_ACTION[result.state] ?? "job.unknown",
        job_id: jobId,
      });
      publish({ kind: "done", state: result.state, reason: result.reason });

      // Runtime → governance feedback: attribute the job's cost across the skills
      // it used. Use result.usage (cumulative across resumes), and make it
      // best-effort so a feedback failure can't fail an already-persisted job.
      if (this.opts.usageSink && result.state !== "paused" && result.loadedSkills.length > 0) {
        const total = estimateCostUsd(model, result.usage);
        const perSkill = Number.isFinite(total) ? total / result.loadedSkills.length : 0;
        const sink = this.opts.usageSink;
        const results = await Promise.allSettled(
          result.loadedSkills.map((skill) =>
            sink.recordUsage(skill.name, skill.version, {
              success: result.state === "done",
              cost_usd: perSkill,
            }),
          ),
        );
        for (const r of results) {
          if (r.status === "rejected")
            console.warn(`[auriga] skill usage feedback failed: ${r.reason}`);
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
