import {
  userText,
  type AcceptanceCriterion,
  type JobSpec,
  type LoadedSkill,
  type Message,
  type ModelProvider,
  type SkillRegistry,
  type TraceEvent,
  type Usage,
  type VerificationKey,
} from "@auriga/core";
import type { Sandbox } from "@auriga/sandbox";
import { ToolDispatcher } from "./dispatcher";
import { makeMemoryTools, WorkspaceMemory } from "./memory";
import { runLoop } from "./loop";
import { makeSelectSkillTool, SkillResolver } from "./skills";
import type { Tool } from "./tool";
import { makeSandboxTools } from "./tools/sandbox-tools";
import { VerificationGate, type NamedCheck, type VerificationResult } from "./verification";

/** Harness-internal tools that are always available regardless of the job allowlist. */
const HARNESS_TOOLS = ["update_todo", "read_todo", "note", "select_skill"];

/** HITL gate: whether this job has human approval to execute. */
export interface ApprovalGate {
  isApproved(): Promise<boolean>;
}

export type JobEvent =
  | { type: "attempt"; attempt: number; steps: number; usage: Usage }
  | { type: "verify"; attempt: number; passed: boolean; evidence: string };

/** State needed to resume a job on a fresh worker (the workspace is restored separately). */
export interface JobResumeState {
  messages: Message[];
  usage: Usage;
  steps: number;
  startAttempt: number;
}

/** Reported after each verify so the worker can checkpoint (snapshot + persist). */
export interface AttemptInfo {
  attempt: number;
  passed: boolean;
  messages: Message[];
  usage: Usage;
  steps: number;
  loadedSkills: LoadedSkill[];
}

export interface RunJobOptions {
  spec: JobSpec;
  provider: ModelProvider;
  model: string;
  /** A sandbox already created with the job's workspace seeded. */
  sandbox: Sandbox;
  /** Optional skill registry + trusted keys to enable skill loading. */
  registry?: SkillRegistry;
  trustedKeys?: VerificationKey[];
  role?: string;
  namedChecks?: Record<string, NamedCheck>;
  /** Verify-retry attempts (default 3). */
  maxAttempts?: number;
  /** Steps per execute phase (default derived from the budget). */
  stepsPerAttempt?: number;
  /** Observability hook (cost/progress). */
  onEvent?: (event: JobEvent) => void;
  /** Trace hook: full event stream (model responses, tool calls, skills, verify). */
  onTrace?: (event: TraceEvent) => void;
  /** HITL gate consulted before execution when spec.require_approval is set. */
  approvalGate?: ApprovalGate;
  /** Resume from a prior checkpoint instead of starting fresh. */
  resume?: JobResumeState;
  /** Called after each verify so the worker can snapshot + persist a checkpoint. */
  onAttempt?: (info: AttemptInfo) => void | Promise<void>;
}

export interface RunJobResult {
  state: "done" | "failed" | "paused";
  reason: string;
  attempts: number;
  steps: number;
  usage: Usage;
  verification: VerificationResult | null;
  loadedSkills: LoadedSkill[];
  messages: Message[];
}

/**
 * Run a job to completion with the Plan-Execute-Verify loop:
 *   Plan    — the model writes a todo (filesystem-as-memory),
 *   Execute — the ReAct loop drives sandbox tools (allowlist enforced in code),
 *   Verify  — the verification gate runs the acceptance criteria; the job is done
 *             ONLY if they pass, else the failure evidence is fed back and the
 *             loop retries, bounded by the step/token budget.
 */
export async function runJob(opts: RunJobOptions): Promise<RunJobResult> {
  const { spec, provider, model, sandbox } = opts;
  const memory = new WorkspaceMemory(sandbox);
  const role = opts.role ?? "agent";

  // --- skills: resolve metadata, mount required, expose select_skill ---
  const tools: Tool[] = [...makeSandboxTools(sandbox), ...makeMemoryTools(memory)];
  const recordedSkills = new Set<string>();
  let resolver: SkillResolver | undefined;
  let catalog = "";
  const requiredBodies: string[] = [];
  if (opts.registry && opts.trustedKeys) {
    resolver = new SkillResolver({
      registry: opts.registry,
      trustedKeys: opts.trustedKeys,
      context: {
        factio: spec.factio,
        role,
        ...(spec.allowed_skills ? { allowed_skills: spec.allowed_skills } : {}),
      },
    });
    catalog = await resolver.catalogPrompt();
    for (const name of spec.required_skills ?? []) {
      const mounted = await resolver.select(sandbox, name); // PolicyError if not permitted / bad sig
      requiredBodies.push(
        `### Skill: ${mounted.metadata.name} (mounted at ${mounted.mountPath})\n${mounted.skill_md}`,
      );
    }
    tools.push(makeSelectSkillTool(resolver, sandbox));
    flushSkillTrace();
  }

  const allowed = [...new Set([...spec.allowed_tools, ...HARNESS_TOOLS])];
  const dispatcher = new ToolDispatcher(tools, allowed);

  const system = buildSystemPrompt(spec, catalog, requiredBodies);
  const messages: Message[] = opts.resume
    ? [...opts.resume.messages]
    : [userText(buildTaskMessage(spec))];

  const maxAttempts = opts.maxAttempts ?? 3;
  const stepsPerAttempt =
    opts.stepsPerAttempt ?? Math.max(4, Math.min(spec.budget.max_steps, 24));
  const gate = new VerificationGate(opts.namedChecks ?? {}, {
    timeoutMs: spec.budget.max_wall_time_s * 1000,
  });

  const usage: Usage = opts.resume
    ? { ...opts.resume.usage }
    : { input_tokens: 0, output_tokens: 0 };
  let totalSteps = opts.resume?.steps ?? 0;
  const startAttempt = opts.resume?.startAttempt ?? 1;
  let verification: VerificationResult | null = null;

  // HITL gate: pause before doing any work until a human approves.
  if (spec.require_approval && opts.approvalGate && !(await opts.approvalGate.isApproved())) {
    return finish("paused", "awaiting human approval", 0);
  }

  for (let attempt = startAttempt; attempt <= maxAttempts; attempt++) {
    const remainingSteps = spec.budget.max_steps - totalSteps;
    if (remainingSteps <= 0) {
      return finish("failed", "step budget exhausted");
    }
    if (usage.input_tokens + usage.output_tokens >= spec.budget.max_tokens) {
      return finish("failed", "token budget exhausted");
    }

    const loopRes = await runLoop({
      provider,
      model,
      system,
      messages,
      dispatcher,
      maxSteps: Math.min(stepsPerAttempt, remainingSteps),
      maxTokens: 4096,
      compaction: { maxTokens: Math.floor(spec.budget.max_tokens * 0.5), keepRecent: 6 },
      onCompact: async (dropped) => {
        await memory.appendScratchpad(`# context compacted: ${dropped.length} messages offloaded`);
      },
      ...(opts.onTrace ? { onTrace: opts.onTrace } : {}),
    });

    usage.input_tokens += loopRes.usage.input_tokens;
    usage.output_tokens += loopRes.usage.output_tokens;
    totalSteps += loopRes.steps;
    messages.splice(0, messages.length, ...loopRes.messages);
    flushSkillTrace(); // capture any model-invoked skill loads
    opts.onEvent?.({ type: "attempt", attempt, steps: loopRes.steps, usage: { ...usage } });

    verification = await gate.verify(sandbox, spec.acceptance_criteria);
    const evidence = verification.results
      .filter((r) => !r.passed)
      .map((r) => r.evidence)
      .join("\n\n");
    opts.onEvent?.({ type: "verify", attempt, passed: verification.passed, evidence });
    opts.onTrace?.({
      type: "verify",
      attempt,
      passed: verification.passed,
      criteria: verification.results.map((r) => ({
        kind: r.criterion.kind,
        passed: r.passed,
        evidence: r.evidence,
      })),
    });

    if (verification.passed) {
      await opts.onAttempt?.(attemptInfo(attempt, true));
      return finish("done", "acceptance criteria passed", attempt);
    }

    // prime the next attempt with the failure evidence, then checkpoint
    messages.push(userText(`Verification failed — fix the issues and continue:\n\n${evidence}`));
    await opts.onAttempt?.(attemptInfo(attempt, false));
  }

  return finish("failed", "verification did not pass within budget", maxAttempts);

  function flushSkillTrace(): void {
    if (!resolver || !opts.onTrace) return;
    for (const skill of resolver.loadedSkills()) {
      if (recordedSkills.has(skill.name)) continue;
      recordedSkills.add(skill.name);
      opts.onTrace({ type: "skill_loaded", skill });
    }
  }

  function attemptInfo(attempt: number, passed: boolean): AttemptInfo {
    return {
      attempt,
      passed,
      messages,
      usage: { ...usage },
      steps: totalSteps,
      loadedSkills: resolver?.loadedSkills() ?? [],
    };
  }

  function finish(
    state: "done" | "failed" | "paused",
    reason: string,
    attempt = maxAttempts,
  ): RunJobResult {
    return {
      state,
      reason,
      attempts: attempt,
      steps: totalSteps,
      usage,
      verification,
      loadedSkills: resolver?.loadedSkills() ?? [],
      messages,
    };
  }
}

function buildSystemPrompt(spec: JobSpec, catalog: string, requiredBodies: string[]): string {
  const parts = [
    "You are Auriga, an autonomous coding agent running a single job to completion inside a sandbox.",
    "Work in a Plan → Execute → Verify loop:",
    "1. Plan: call update_todo to record a short checklist of steps.",
    "2. Execute: use the tools to do the work. Read a file before editing it; make small changes and re-check.",
    "3. Verify: the platform runs the acceptance criteria below. You are NOT done until they pass — your opinion does not count. Do not weaken or delete tests to pass.",
    "When you believe the criteria pass, stop calling tools and briefly report what you did.",
    "",
    "Acceptance criteria (the verification gate):",
    spec.acceptance_criteria.map(formatCriterion).join("\n"),
  ];
  if (catalog) parts.push("", catalog);
  if (requiredBodies.length) parts.push("", "Required skills (already loaded):", ...requiredBodies);
  return parts.join("\n");
}

function buildTaskMessage(spec: JobSpec): string {
  const lines = [`Goal: ${spec.goal}`];
  const ws = spec.context_refs.workspace;
  lines.push(`Workspace: ${ws.kind} ${ws.url_or_path} (it is your current working directory).`);
  if (spec.context_refs.files?.length) lines.push(`Relevant files: ${spec.context_refs.files.join(", ")}`);
  if (spec.context_refs.links?.length) lines.push(`Links: ${spec.context_refs.links.join(", ")}`);
  return lines.join("\n");
}

function formatCriterion(c: AcceptanceCriterion): string {
  switch (c.kind) {
    case "command":
      return `- run \`${c.cmd}\` and it must exit ${c.expect_exit}`;
    case "file_exists":
      return `- the file \`${c.path}\` must exist`;
    case "named_check":
      return `- the named check \`${c.name}\` must pass`;
  }
}
