import { textResponse, toolUseResponse } from "@auriga/core";
import { StubProvider } from "@auriga/provider";
import { LocalSandboxDriver } from "@auriga/sandbox";
import { Worker, type AuditLog, type EventBus, type JobStore } from "@auriga/habenae";

/**
 * A deterministic, network-free background runner for E2E + offline dev. Each run
 * uses a {@link StubProvider} that writes `answer.txt` then stops — so a job whose
 * acceptance criterion is `file_exists: answer.txt` streams real state/trace/
 * progress/done over the bus to completion, with no model call. Gated by
 * `AURIGA_STUB_RUNNER=1`; never wired with a real provider.
 */
export function createStubRunner(
  store: JobStore,
  audit: AuditLog,
  bus: EventBus,
): { run: (jobId: string) => void } {
  const inFlight = new Set<string>();
  const driver = new LocalSandboxDriver();
  return {
    run(jobId) {
      if (inFlight.has(jobId)) return; // single-flight
      inFlight.add(jobId);
      void (async () => {
        try {
          await new Worker({
            store,
            provider: new StubProvider([
              toolUseResponse("write_file", { path: "answer.txt", content: "ok\n" }),
              textResponse("wrote answer.txt"),
            ]),
            model: "claude-sonnet-4-6", // priced, so live cost is non-zero
            sandboxDriver: driver,
            bus,
            audit,
          }).run(jobId);
        } catch (err) {
          console.error(
            `[auriga] stub run ${jobId} failed:`,
            err instanceof Error ? err.message : err,
          );
        } finally {
          inFlight.delete(jobId);
        }
      })();
    },
  };
}
