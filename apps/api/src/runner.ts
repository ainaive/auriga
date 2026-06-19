import { AnthropicProvider, MODELS } from "@auriga/provider";
import { selectDriver, type SandboxDriver } from "@auriga/sandbox";
import { Worker, type AuditLog, type EventBus, type JobStore } from "@auriga/habenae";

/**
 * A background job runner for the dev API. `run(id)` kicks the existing Worker in
 * THIS process (fire-and-forget) and returns immediately — the HTTP request never
 * blocks on the (possibly minutes-long) job. Dev-grade: production moves execution
 * to a separate worker via GraphileQueue + RUN_JOB_TASK.
 *
 * Returns `undefined` when ANTHROPIC_API_KEY is unset, so the route can answer 503.
 */
export function createRunner(
  store: JobStore,
  audit: AuditLog,
  bus?: EventBus,
): { run: (jobId: string) => void } | undefined {
  if (!process.env.ANTHROPIC_API_KEY) return undefined;

  const model = process.env.AURIGA_MODEL ?? MODELS.sonnet;
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
            provider: new AnthropicProvider(),
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
