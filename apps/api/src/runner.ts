import { MODELS, hasCredentials, providerFor, resolveModel } from "@auriga/provider";
import { selectDriver, type SandboxDriver } from "@auriga/sandbox";
import { Worker, type AuditLog, type EventBus, type JobStore } from "@auriga/habenae";

/**
 * A background job runner for the dev API. `run(id)` kicks the existing Worker in
 * THIS process (fire-and-forget) and returns immediately — the HTTP request never
 * blocks on the (possibly minutes-long) job. Dev-grade: production moves execution
 * to a separate worker via GraphileQueue + RUN_JOB_TASK.
 *
 * Returns `undefined` when the backend the model resolves to has no credentials,
 * so the route can answer 503.
 */
export function createRunner(
  store: JobStore,
  audit: AuditLog,
  bus?: EventBus,
): { run: (jobId: string) => void } | undefined {
  const rawModel = process.env.AURIGA_MODEL ?? MODELS.sonnet;
  // Resolve the backend + the bare model id (a `vendor/model` override is stripped).
  // A bad AURIGA_MODEL must not crash runner creation — let the route answer 503.
  let resolved: ReturnType<typeof resolveModel>;
  try {
    resolved = resolveModel(rawModel);
  } catch {
    console.error(`[auriga] invalid AURIGA_MODEL "${rawModel}": no provider matches its prefix`);
    return undefined;
  }
  if (!hasCredentials(resolved.kind)) return undefined;
  const model = resolved.model;
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
          const worker = new Worker({
            store,
            // Resolve the backend from the raw id (honors a `vendor/` override); run the bare model.
            provider: providerFor(rawModel),
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
