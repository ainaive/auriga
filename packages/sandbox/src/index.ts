/**
 * @auriga/sandbox — the Sandbox abstraction + drivers. One ephemeral sandbox per
 * job; isolation lives behind the driver so the harness loop is agnostic.
 */
export type {
  Sandbox,
  SandboxDriver,
  ExecOptions,
  ExecResult,
  SandboxLimits,
  CreateSandboxOptions,
  WorkspaceSeed,
} from "./types";
export { LocalSandboxDriver } from "./local";
export { DockerSandboxDriver } from "./docker";
export { selectDriver } from "./select";
