// Pure assembly + validation for the job builder form. Kept free of React so the
// build/validate logic is unit-testable (Vitest). The control-plane API is the
// authority (it re-validates against the real JobSpecSchema via parseJobSpec);
// this gives fast, field-level feedback in the browser.

export type CriterionDraft =
  | { kind: "command"; cmd: string; expectExit: string }
  | { kind: "file_exists"; path: string }
  | { kind: "named_check"; name: string };

export interface JobFormState {
  id: string;
  goal: string;
  workspaceKind: "git" | "dir";
  workspacePath: string;
  workspaceRef: string;
  allowedTools: string;
  criteria: CriterionDraft[];
  maxTokens: string;
  maxWallTimeS: string;
  maxCostUsd: string;
  maxSteps: string;
  requireApproval: boolean;
  allowedSkills: string;
  requiredSkills: string;
  files: string;
  links: string;
  dependsOn: string;
}

export function defaultJobForm(): JobFormState {
  return {
    id: "",
    goal: "",
    workspaceKind: "dir",
    workspacePath: "./fixtures/failing-test",
    workspaceRef: "",
    allowedTools: "read_file, write_file, bash, git, search",
    criteria: [{ kind: "command", cmd: "bun test", expectExit: "0" }],
    maxTokens: "200000",
    maxWallTimeS: "600",
    maxCostUsd: "5",
    maxSteps: "30",
    requireApproval: false,
    allowedSkills: "",
    requiredSkills: "",
    files: "",
    links: "",
    dependsOn: "",
  };
}

export function emptyCriterion(kind: CriterionDraft["kind"]): CriterionDraft {
  if (kind === "command") return { kind, cmd: "", expectExit: "0" };
  if (kind === "file_exists") return { kind, path: "" };
  return { kind, name: "" };
}

/** Split a comma/newline-separated input into a trimmed, non-empty list. */
export function csv(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface JobIdentity {
  factio: string;
  created_by: string;
}

export interface BuildResult {
  spec?: Record<string, unknown>;
  errors: Record<string, string>;
}

function positiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function positiveNum(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Assemble + validate a JobSpec-shaped object from the form. Returns field errors. */
export function buildJobSpec(form: JobFormState, identity: JobIdentity): BuildResult {
  const errors: Record<string, string> = {};

  if (!form.id.trim()) errors.id = "id is required";
  if (!form.goal.trim()) errors.goal = "goal is required";
  if (!form.workspacePath.trim()) errors.workspacePath = "workspace path/url is required";

  const allowed_tools = csv(form.allowedTools);
  if (allowed_tools.length === 0) errors.allowedTools = "at least one tool is required";

  const acceptance_criteria = form.criteria.map((c, i) => {
    if (c.kind === "command") {
      if (!c.cmd.trim()) errors[`criteria.${i}`] = "command is required";
      const exit = Number(c.expectExit);
      if (!Number.isInteger(exit)) errors[`criteria.${i}`] = "expected exit must be an integer";
      return { kind: "command", cmd: c.cmd.trim(), expect_exit: exit };
    }
    if (c.kind === "file_exists") {
      if (!c.path.trim()) errors[`criteria.${i}`] = "path is required";
      return { kind: "file_exists", path: c.path.trim() };
    }
    if (!c.name.trim()) errors[`criteria.${i}`] = "check name is required";
    return { kind: "named_check", name: c.name.trim() };
  });
  if (acceptance_criteria.length === 0) errors.criteria = "at least one acceptance criterion is required";

  const max_tokens = positiveInt(form.maxTokens);
  const max_wall_time_s = positiveInt(form.maxWallTimeS);
  const max_cost_usd = positiveNum(form.maxCostUsd);
  const max_steps = positiveInt(form.maxSteps);
  if (max_tokens === null) errors.maxTokens = "must be a positive integer";
  if (max_wall_time_s === null) errors.maxWallTimeS = "must be a positive integer";
  if (max_cost_usd === null) errors.maxCostUsd = "must be a positive number";
  if (max_steps === null) errors.maxSteps = "must be a positive integer";

  if (Object.keys(errors).length > 0) return { errors };

  const workspace: Record<string, unknown> = {
    kind: form.workspaceKind,
    url_or_path: form.workspacePath.trim(),
  };
  if (form.workspaceRef.trim()) workspace.ref = form.workspaceRef.trim();

  const context_refs: Record<string, unknown> = { workspace };
  const files = csv(form.files);
  const links = csv(form.links);
  if (files.length) context_refs.files = files;
  if (links.length) context_refs.links = links;

  const spec: Record<string, unknown> = {
    id: form.id.trim(),
    factio: identity.factio,
    created_by: identity.created_by,
    goal: form.goal.trim(),
    context_refs,
    allowed_tools,
    acceptance_criteria,
    budget: { max_tokens, max_wall_time_s, max_cost_usd, max_steps },
  };

  const allowed_skills = csv(form.allowedSkills);
  const required_skills = csv(form.requiredSkills);
  const depends_on = csv(form.dependsOn);
  if (allowed_skills.length) spec.allowed_skills = allowed_skills;
  if (required_skills.length) spec.required_skills = required_skills;
  if (depends_on.length) spec.depends_on = depends_on;
  if (form.requireApproval) spec.require_approval = true;

  return { spec, errors: {} };
}
