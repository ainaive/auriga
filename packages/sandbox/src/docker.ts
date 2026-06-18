import { newId } from "@auriga/core";
import { spawnCapture } from "./spawn";
import type {
  CreateSandboxOptions,
  ExecOptions,
  ExecResult,
  Sandbox,
  SandboxDriver,
} from "./types";

const DEFAULT_IMAGE = "oven/bun:1";
const WORKDIR = "/workspace";

/**
 * A sandbox backed by an ephemeral Docker container. Real isolation: the job runs
 * inside the container with optional cpu/memory limits and (by default) no
 * network. The container is removed on destroy.
 *
 * NOTE: true egress allowlisting needs a proxy/firewall; for now an empty
 * allowlist means `--network none`, and a non-empty one falls back to the default
 * bridge (a follow-up will enforce the allowlist).
 */
class DockerSandbox implements Sandbox {
  constructor(
    readonly id: string,
    private readonly containerId: string,
  ) {}

  private docker(args: string[], input?: string): Promise<ExecResult> {
    return spawnCapture("docker", args, input !== undefined ? { input } : {});
  }

  async exec(cmd: string, opts: ExecOptions = {}): Promise<ExecResult> {
    const workdir = opts.cwd ? `${WORKDIR}/${opts.cwd}` : WORKDIR;
    const envArgs = opts.env
      ? Object.entries(opts.env).flatMap(([k, v]) => ["-e", `${k}=${v}`])
      : [];
    return spawnCapture(
      "docker",
      ["exec", "-w", workdir, ...envArgs, this.containerId, "sh", "-c", cmd],
      opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {},
    );
  }

  async readFile(path: string): Promise<string> {
    const r = await this.docker(["exec", this.containerId, "cat", `${WORKDIR}/${path}`]);
    if (r.exitCode !== 0) throw new Error(`readFile failed: ${path}: ${r.stderr.trim()}`);
    return r.stdout;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const full = `${WORKDIR}/${path}`;
    await this.docker(
      ["exec", "-i", this.containerId, "sh", "-c", `mkdir -p "$(dirname '${full}')" && cat > '${full}'`],
      content,
    );
  }

  async exists(path: string): Promise<boolean> {
    const r = await this.docker(["exec", this.containerId, "test", "-e", `${WORKDIR}/${path}`]);
    return r.exitCode === 0;
  }

  async list(dir = "."): Promise<string[]> {
    const r = await this.docker(["exec", this.containerId, "ls", "-1", `${WORKDIR}/${dir}`]);
    return r.stdout.split("\n").filter((s) => s.length > 0);
  }

  async mountSkill(name: string, files: Record<string, Uint8Array>): Promise<string> {
    const base = `/skills/${name}`;
    for (const [path, bytes] of Object.entries(files)) {
      const full = `${base}/${path}`;
      const b64 = Buffer.from(bytes).toString("base64");
      await this.docker(
        [
          "exec",
          "-i",
          this.containerId,
          "sh",
          "-c",
          `mkdir -p "$(dirname '${full}')" && base64 -d > '${full}'`,
        ],
        b64,
      );
    }
    return base;
  }

  async destroy(): Promise<void> {
    await this.docker(["rm", "-f", this.containerId]);
  }
}

export class DockerSandboxDriver implements SandboxDriver {
  readonly name = "docker";

  async isAvailable(): Promise<boolean> {
    try {
      const r = await spawnCapture("docker", ["info"]);
      return r.exitCode === 0;
    } catch {
      return false;
    }
  }

  async create(opts: CreateSandboxOptions = {}): Promise<Sandbox> {
    const image = opts.image ?? DEFAULT_IMAGE;
    const limitArgs: string[] = [];
    if (opts.limits?.cpus) limitArgs.push("--cpus", String(opts.limits.cpus));
    if (opts.limits?.memoryMb) limitArgs.push("--memory", `${opts.limits.memoryMb}m`);
    const network = opts.limits?.egressAllowlist?.length ? [] : ["--network", "none"];

    const run = await spawnCapture("docker", [
      "run",
      "-d",
      "--rm",
      ...limitArgs,
      ...network,
      "-w",
      WORKDIR,
      image,
      "sleep",
      "infinity",
    ]);
    if (run.exitCode !== 0) throw new Error(`docker run failed: ${run.stderr.trim()}`);
    const containerId = run.stdout.trim();

    await spawnCapture("docker", ["exec", containerId, "mkdir", "-p", WORKDIR]);
    if (opts.workspace?.kind === "dir") {
      const cp = await spawnCapture("docker", [
        "cp",
        `${opts.workspace.path}/.`,
        `${containerId}:${WORKDIR}`,
      ]);
      if (cp.exitCode !== 0) {
        await spawnCapture("docker", ["rm", "-f", containerId]);
        throw new Error(`docker cp failed: ${cp.stderr.trim()}`);
      }
    }

    return new DockerSandbox(newId("sbx"), containerId);
  }
}
