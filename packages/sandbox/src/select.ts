import { DockerSandboxDriver } from "./docker";
import { LocalSandboxDriver } from "./local";
import type { SandboxDriver } from "./types";

export interface SelectDriverOptions {
  prefer?: "docker" | "local";
  /**
   * Permit falling back to the NON-ISOLATED Local driver when Docker is
   * unavailable. Off by default — the downgrade must be an explicit caller choice
   * (running untrusted agent output without isolation is a security decision).
   */
  allowLocalFallback?: boolean;
}

/**
 * Pick a sandbox driver. Prefers Docker (real isolation). If Docker is
 * unavailable, throws unless `allowLocalFallback` is set (then warns and uses the
 * non-isolated Local driver). Pass `prefer: "local"` to force Local in tests.
 */
export async function selectDriver(opts: SelectDriverOptions = {}): Promise<SandboxDriver> {
  if (opts.prefer === "local") return new LocalSandboxDriver();
  const docker = new DockerSandboxDriver();
  if (opts.prefer === "docker") return docker;
  if (await docker.isAvailable()) return docker;
  if (opts.allowLocalFallback) {
    console.warn(
      "[auriga] Docker unavailable — falling back to the NON-ISOLATED Local sandbox (trusted dev/test only).",
    );
    return new LocalSandboxDriver();
  }
  throw new Error(
    "Docker sandbox unavailable and local fallback not allowed. " +
      "Pass { allowLocalFallback: true } only for trusted dev/test.",
  );
}
