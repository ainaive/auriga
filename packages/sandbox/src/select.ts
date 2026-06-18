import { DockerSandboxDriver } from "./docker";
import { LocalSandboxDriver } from "./local";
import type { SandboxDriver } from "./types";

/**
 * Pick a sandbox driver. Defaults to Docker (real isolation) when available,
 * falling back to Local otherwise. Pass `prefer` to force a choice (e.g. "local"
 * in tests).
 */
export async function selectDriver(prefer?: "docker" | "local"): Promise<SandboxDriver> {
  if (prefer === "local") return new LocalSandboxDriver();
  const docker = new DockerSandboxDriver();
  if (prefer === "docker") return docker;
  return (await docker.isAvailable()) ? docker : new LocalSandboxDriver();
}
