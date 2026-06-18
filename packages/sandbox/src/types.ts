/**
 * The Sandbox abstraction. One ephemeral sandbox per job. Drivers implement
 * isolation behind this interface so the loop never depends on the mechanism
 * (Local subprocess for dev/tests, Docker container for real isolation; gVisor /
 * Firecracker / Vercel Sandbox can follow as additional drivers).
 *
 * All paths are workspace-relative (the workspace root is the sandbox's CWD).
 */

export interface ExecOptions {
  /** Working dir relative to the workspace root. */
  cwd?: string;
  env?: Record<string, string>;
  /** Kill the process after this many ms (sets timedOut). */
  timeoutMs?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface Sandbox {
  readonly id: string;
  /** Run a shell command in the workspace, capturing output and exit code. */
  exec(cmd: string, opts?: ExecOptions): Promise<ExecResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(dir?: string): Promise<string[]>;
  /** Mount skill files (path -> bytes). Returns the mount root inside the sandbox. */
  mountSkill(name: string, files: Record<string, Uint8Array>): Promise<string>;
  /** Tear down the sandbox and free its resources. */
  destroy(): Promise<void>;
}

export interface SandboxLimits {
  cpus?: number;
  memoryMb?: number;
  /** Egress allowlist (hostnames). Empty/undefined → no network (Docker driver). */
  egressAllowlist?: string[];
}

export type WorkspaceSeed =
  | { kind: "dir"; path: string }
  | { kind: "empty" };

export interface CreateSandboxOptions {
  workspace?: WorkspaceSeed;
  limits?: SandboxLimits;
  /** Container image (Docker driver only). */
  image?: string;
}

export interface SandboxDriver {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  create(opts?: CreateSandboxOptions): Promise<Sandbox>;
}
