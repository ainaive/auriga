import {
  MODELS,
  credentialEnvFor,
  hasCredentials,
  providerFor,
  resolveModel,
  type CredentialSource,
} from "@auriga/provider";
import { selectDriver, type SandboxDriver } from "@auriga/sandbox";
import {
  Worker,
  type AuditLog,
  type ConfigStore,
  type EventBus,
  type JobStore,
} from "@auriga/habenae";

/**
 * A background job runner for the dev API. `run(id)` kicks the existing Worker in
 * THIS process (fire-and-forget) and returns immediately — the HTTP request never
 * blocks on the (possibly minutes-long) job. Dev-grade: production moves execution
 * to a separate worker via GraphileQueue + RUN_JOB_TASK.
 *
 * Credentials are resolved per run from the config store (console-managed keys override
 * env), so adding a key in the console takes effect without a restart. Returns
 * `undefined` only when `AURIGA_MODEL` is malformed (the model is process-level static);
 * a run with no usable credentials fails the job with a clear reason.
 */
export function createRunner(
  store: JobStore,
  audit: AuditLog,
  config: ConfigStore,
  bus?: EventBus,
): { run: (jobId: string) => void } | undefined {
  const rawModel = process.env.AURIGA_MODEL ?? MODELS.sonnet;
  let resolved: ReturnType<typeof resolveModel>;
  try {
    resolved = resolveModel(rawModel);
  } catch {
    console.error(`[auriga] invalid AURIGA_MODEL "${rawModel}": no provider matches its prefix`);
    return undefined;
  }
  const model = resolved.model;
  // Console-configured credentials (live snapshot), overriding env in the factory.
  const credentials: CredentialSource = (kind) => config.current().providers?.[kind];
  const inFlight = new Set<string>();
  // Resolve the sandbox driver once, lazily (Local fallback unless AURIGA_REQUIRE_DOCKER=1).
  let driverP: Promise<SandboxDriver> | undefined;
  const driver = () =>
    (driverP ??= selectDriver({ allowLocalFallback: process.env.AURIGA_REQUIRE_DOCKER !== "1" }));

  return {
    run(jobId) {
      if (inFlight.has(jobId)) return; // single-flight: ignore double-run
      inFlight.add(jobId);
      void (async () => {
        try {
          if (!hasCredentials(resolved.kind, credentials)) {
            const reason = `no credentials for ${resolved.kind} — set ${credentialEnvFor(resolved.kind)} or add a key in the console`;
            console.error(`[auriga] run ${jobId}: ${reason}`);
            await store.update(jobId, { state: "failed", reason });
            return;
          }
          const worker = new Worker({
            store,
            // Resolve the backend from the raw id (honors a `vendor/` override); run the bare model.
            provider: providerFor(rawModel, { credentials }),
            model,
            sandboxDriver: await driver(),
            audit,
            ...(bus ? { bus } : {}),
          });
          await worker.run(jobId);
        } catch (err) {
          console.error(`[auriga] run ${jobId} failed:`, err instanceof Error ? err.message : err);
        } finally {
          inFlight.delete(jobId);
        }
      })();
    },
  };
}
