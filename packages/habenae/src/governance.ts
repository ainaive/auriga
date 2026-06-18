import { PolicyError, type JobSpec } from "@auriga/core";
import type { AuditLog } from "./audit";
import type { JobRecord, JobStore } from "./types";

/** Per-tenant access rules (RBAC). */
export interface FactioPolicy {
  factio: string;
  /** Roles permitted to submit jobs to this tenant. */
  roles: string[];
  /** If set, only these tools may appear in a job's allowed_tools. */
  allowed_tools?: string[];
  /** If set, the permitted skill set; a job's allowed_skills is narrowed to it. */
  allowed_skills?: string[];
}

export interface Policy {
  forFactio(factio: string): FactioPolicy | undefined;
}

export class InMemoryPolicy implements Policy {
  private readonly byFactio: Map<string, FactioPolicy>;
  constructor(policies: FactioPolicy[]) {
    this.byFactio = new Map(policies.map((p) => [p.factio, p]));
  }
  forFactio(factio: string): FactioPolicy | undefined {
    return this.byFactio.get(factio);
  }
}

/** Who is submitting. */
export interface Actor {
  factio: string;
  role: string;
}

export interface SubmitOptions {
  store: JobStore;
  policy: Policy;
  spec: JobSpec;
  actor: Actor;
  /** Optional audit trail for job.created / policy.denied. */
  audit?: AuditLog;
}

function intersect(a: readonly string[], b: readonly string[]): string[] {
  const set = new Set(b);
  return a.filter((x) => set.has(x));
}

/**
 * Front-door RBAC gate (permissions in code, not the prompt). Verifies the actor
 * may submit to the job's tenant, that requested tools are permitted, and narrows
 * the job's allowed_skills to the tenant's permitted set (rejecting required
 * skills that fall outside it). The skill resolver re-checks at resolution time.
 */
export async function submitJob(opts: SubmitOptions): Promise<JobRecord> {
  const { store, policy, spec, actor, audit } = opts;
  try {
    if (actor.factio !== spec.factio) {
      throw new PolicyError(`actor in factio ${actor.factio} cannot submit to ${spec.factio}`);
    }
    const fp = policy.forFactio(spec.factio);
    if (!fp) throw new PolicyError(`unknown factio: ${spec.factio}`);
    if (!fp.roles.includes(actor.role)) {
      throw new PolicyError(`role ${actor.role} is not permitted in factio ${spec.factio}`);
    }

    // Dependencies must stay within the tenant — a cross-tenant dep would gate this
    // job on another factio's state (and leak its lifecycle across the boundary).
    for (const depId of spec.depends_on ?? []) {
      const dep = await store.get(depId);
      if (dep && dep.spec.factio !== spec.factio) {
        throw new PolicyError(
          `dependency ${depId} belongs to factio ${dep.spec.factio}, not ${spec.factio}`,
        );
      }
    }

    if (fp.allowed_tools) {
      const disallowed = spec.allowed_tools.filter((t) => !fp.allowed_tools!.includes(t));
      if (disallowed.length > 0) {
        throw new PolicyError(`tools not permitted in ${spec.factio}: ${disallowed.join(", ")}`);
      }
    }

    let effective = spec;
    if (fp.allowed_skills) {
      const permitted = fp.allowed_skills;
      for (const required of spec.required_skills ?? []) {
        if (!permitted.includes(required)) {
          throw new PolicyError(`required skill not permitted in ${spec.factio}: ${required}`);
        }
      }
      effective = {
        ...spec,
        allowed_skills: intersect(spec.allowed_skills ?? permitted, permitted),
      };
    }

    const record = await store.create(effective);
    await audit?.record({ factio: spec.factio, actor: actor.role, action: "job.created", job_id: spec.id });
    return record;
  } catch (err) {
    if (audit && err instanceof PolicyError) {
      await audit.record({
        factio: spec.factio,
        actor: actor.role,
        action: "policy.denied",
        job_id: spec.id,
        detail: err.message,
      });
    }
    throw err;
  }
}
