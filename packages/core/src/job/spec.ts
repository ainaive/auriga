import { z } from "zod";
import { ValidationError } from "../errors";

/**
 * The Job contract: goal/spec + context refs + allowed tools + allowed/required
 * skills + decidable acceptance criteria + budget. This is the unit of scheduling
 * and delivery on the platform. Schemas are the source of truth; types are inferred.
 */

export const WorkspaceRefSchema = z.object({
  kind: z.enum(["git", "dir"]),
  url_or_path: z.string().min(1),
  ref: z.string().min(1).optional(),
});

export const ContextRefsSchema = z.object({
  workspace: WorkspaceRefSchema,
  files: z.array(z.string()).optional(),
  links: z.array(z.string()).optional(),
});

/** A decidable acceptance check. The verification gate must pass these before `done`. */
export const AcceptanceCriterionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("command"),
    cmd: z.string().min(1),
    expect_exit: z.number().int(),
  }),
  z.object({
    kind: z.literal("file_exists"),
    path: z.string().min(1),
  }),
  z.object({
    kind: z.literal("named_check"),
    name: z.string().min(1),
  }),
]);

export const BudgetSchema = z.object({
  max_tokens: z.number().int().positive(),
  max_wall_time_s: z.number().int().positive(),
  max_cost_usd: z.number().positive(),
  max_steps: z.number().int().positive(),
});

export const JobSpecSchema = z.object({
  id: z.string().min(1),
  /** Tenant (a *factio*). Single value for now; carried so multi-tenant is a switch. */
  factio: z.string().min(1),
  created_by: z.string().min(1),
  goal: z.string().min(1),
  context_refs: ContextRefsSchema,
  /** Code-level tool allowlist (enforced in the dispatcher, not the prompt). */
  allowed_tools: z.array(z.string()),
  /** RBAC-permitted skills the model may select from. */
  allowed_skills: z.array(z.string()).optional(),
  /** Skills that MUST be mounted (governance / determinism). */
  required_skills: z.array(z.string()).optional(),
  acceptance_criteria: z.array(AcceptanceCriterionSchema).min(1),
  budget: BudgetSchema,
  /** Require human approval before the job may execute (HITL gate). */
  require_approval: z.boolean().optional(),
  /** Job ids this job depends on; it runs only once they are all `done` (DAG). */
  depends_on: z.array(z.string()).optional(),
});

export type WorkspaceRef = z.infer<typeof WorkspaceRefSchema>;
export type ContextRefs = z.infer<typeof ContextRefsSchema>;
export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;
export type Budget = z.infer<typeof BudgetSchema>;
export type JobSpec = z.infer<typeof JobSpecSchema>;

/** Parse + validate untrusted input into a JobSpec, throwing ValidationError on failure. */
export function parseJobSpec(input: unknown): JobSpec {
  const result = JobSpecSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(`invalid JobSpec:\n${z.prettifyError(result.error)}`, {
      cause: result.error,
    });
  }
  return result.data;
}
