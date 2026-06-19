import { parseJobSpec, PolicyError } from "@auriga/core";
import {
  buildDashboard,
  safeAudit,
  submitJob,
  type Actor,
  type AuditLog,
  type JobStore,
  type Policy,
} from "@auriga/habenae";
import { HELP, type Command } from "./commands";

export interface ChatContext {
  store: JobStore;
  policy: Policy;
  /** Resolved caller (tenant + role) — the adapter maps the chat user to this. */
  actor: Actor;
  audit?: AuditLog;
}

export interface ChatReply {
  text: string;
}

/**
 * Execute a parsed command against the control plane. All access is scoped to the
 * caller's factio (tenant isolation); submit goes through the RBAC policy gate.
 */
export async function handleCommand(cmd: Command, ctx: ChatContext): Promise<ChatReply> {
  switch (cmd.kind) {
    case "help":
      return { text: HELP };

    case "error":
      return { text: cmd.message };

    case "list": {
      const factio = cmd.factio ?? ctx.actor.factio;
      if (factio !== ctx.actor.factio) return { text: `not permitted to view factio ${factio}` };
      const jobs = await ctx.store.listByFactio(factio);
      return {
        text: jobs.length
          ? jobs.map((j) => `• ${j.id} [${j.state}] ${j.spec.goal}`).join("\n")
          : "(no jobs)",
      };
    }

    case "status": {
      const rec = await ctx.store.get(cmd.id);
      if (!rec || rec.spec.factio !== ctx.actor.factio) return { text: `job not found: ${cmd.id}` };
      const reason = rec.reason ? ` — ${rec.reason}` : "";
      return {
        text: `${rec.id}: ${rec.state}${reason} (attempts ${rec.attempts}, steps ${rec.steps})`,
      };
    }

    case "approve": {
      const rec = await ctx.store.get(cmd.id);
      if (!rec || rec.spec.factio !== ctx.actor.factio) return { text: `job not found: ${cmd.id}` };
      // Same RBAC gate as submit: a tenant match isn't enough — the actor's role
      // must be permitted in the factio, else any same-factio user could approve.
      const fp = ctx.policy.forFactio(ctx.actor.factio);
      if (!fp?.roles.includes(ctx.actor.role)) {
        return {
          text: `denied: role ${ctx.actor.role} is not permitted in factio ${ctx.actor.factio}`,
        };
      }
      await ctx.store.update(cmd.id, { approved: true });
      await safeAudit(ctx.audit, {
        factio: rec.spec.factio,
        actor: ctx.actor.role,
        action: "job.approved",
        job_id: cmd.id,
      });
      return { text: `approved ${cmd.id}` };
    }

    case "dashboard": {
      // Scope to the caller's factio — this surface is tenant-isolated (unlike the
      // admin HTTP dashboard), so don't leak org-wide job/tenant/cost aggregates.
      const factio = ctx.actor.factio;
      const d = await buildDashboard({ store: ctx.store, audit: ctx.audit }, { factio });
      return { text: `${factio}: ${d.totals.jobs} jobs · ~$${d.totals.cost_usd.toFixed(4)}` };
    }

    case "submit": {
      try {
        const spec = parseJobSpec(cmd.spec);
        const rec = await submitJob({
          store: ctx.store,
          policy: ctx.policy,
          spec,
          actor: ctx.actor,
          audit: ctx.audit,
        });
        return { text: `submitted ${rec.id} (pending)` };
      } catch (err) {
        if (err instanceof PolicyError) return { text: `denied: ${err.message}` };
        return { text: `submit failed: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
  }
}
