import { posix } from "node:path";
import { newId } from "@auriga/core";
import { spawnCapture } from "./spawn";
import type {
  CreateSandboxOptions,
  ExecOptions,
  ExecResult,
  Sandbox,
  SandboxDriver,
  SandboxSnapshot,
} from "./types";

export const DEFAULT_IMAGE = "oven/bun:1";
const WORKDIR = "/workspace";
/** Cap for reads that treat stdout as full file content; fail closed past this. */
const FILE_READ_CAP = 64_000_000;

/** Single-quote a string for safe interpolation into a `sh -c` command. */
function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Resolve a relative path under `base`, refusing anything that escapes it. */
function containerPath(base: string, rel: string): string {
  const full = posix.resolve(base, rel);
  if (full !== base && !full.startsWith(`${base}/`)) {
    throw new Error(`path escapes ${base}: ${rel}`);
  }
  return full;
}

function assertOk(action: string, r: ExecResult): void {
  if (r.exitCode !== 0)
    throw new Error(`${action} failed: ${r.stderr.trim() || `exit ${r.exitCode}`}`);
}

/**
 * A sandbox backed by an ephemeral Docker container. Real isolation: the job runs
 * inside the container with optional cpu/memory limits and (by default) no
 * network. The container is removed on destroy.
 *
 * NOTE: true egress allowlisting needs a proxy/firewall; until that exists we fail
 * closed — a non-empty allowlist is rejected rather than silently opening the network.
 */
class DockerSandbox implements Sandbox {
  constructor(
    readonly id: string,
    private readonly containerId: string,
  ) {}

  private docker(
    args: string[],
    opts: { input?: string; maxBytes?: number } = {},
  ): Promise<ExecResult> {
    return spawnCapture("docker", args, opts);
  }

  async exec(cmd: string, opts: ExecOptions = {}): Promise<ExecResult> {
    const workdir = opts.cwd ? containerPath(WORKDIR, opts.cwd) : WORKDIR;
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
    const full = containerPath(WORKDIR, path);
    // File content comes back via stdout, so use a large cap and fail closed on
    // truncation rather than silently returning a partial file.
    const r = await this.docker(["exec", this.containerId, "sh", "-c", `cat ${shq(full)}`], {
      maxBytes: FILE_READ_CAP,
    });
    if (r.exitCode !== 0) throw new Error(`readFile failed: ${path}: ${r.stderr.trim()}`);
    if (r.truncated)
      throw new Error(`readFile truncated (file exceeds ${FILE_READ_CAP} bytes): ${path}`);
    return r.stdout;
  }

  async writeFile(path: string, content: string): Promise<void> {
    const full = containerPath(WORKDIR, path);
    const r = await this.docker(
      [
        "exec",
        "-i",
        this.containerId,
        "sh",
        "-c",
        `mkdir -p "$(dirname ${shq(full)})" && cat > ${shq(full)}`,
      ],
      { input: content },
    );
    assertOk(`writeFile ${path}`, r);
  }

  async exists(path: string): Promise<boolean> {
    const full = containerPath(WORKDIR, path);
    const r = await this.docker(["exec", this.containerId, "sh", "-c", `test -e ${shq(full)}`]);
    if (r.exitCode === 0) return true;
    if (r.exitCode === 1) return false;
    // Any other code is a Docker/container failure, not a "missing file".
    throw new Error(`exists check failed for ${path}: ${r.stderr.trim() || `exit ${r.exitCode}`}`);
  }

  async list(dir = "."): Promise<string[]> {
    const full = containerPath(WORKDIR, dir);
    const r = await this.docker(["exec", this.containerId, "sh", "-c", `ls -1 ${shq(full)}`]);
    assertOk(`list ${dir}`, r);
    return r.stdout.split("\n").filter((s) => s.length > 0);
  }

  async mountSkill(name: string, files: Record<string, Uint8Array>): Promise<string> {
    // Mount UNDER the workspace (relative) so readFile's containment guard can
    // reach the files — consistent with LocalSandbox (.skills/<name>).
    const rel = `.skills/${name}`;
    for (const [path, bytes] of Object.entries(files)) {
      const full = containerPath(WORKDIR, `${rel}/${path}`);
      const b64 = Buffer.from(bytes).toString("base64");
      const r = await this.docker(
        [
          "exec",
          "-i",
          this.containerId,
          "sh",
          "-c",
          `mkdir -p "$(dirname ${shq(full)})" && base64 -d > ${shq(full)}`,
        ],
        { input: b64 },
      );
      assertOk(`mountSkill ${full}`, r);
    }
    return rel;
  }

  async snapshot(): Promise<SandboxSnapshot> {
    const list = await this.docker([
      "exec",
      this.containerId,
      "sh",
      "-c",
      `cd ${WORKDIR} && find . -type f -not -path './.git/*' -not -path '*/node_modules/*'`,
    ]);
    assertOk("snapshot:find", list);
    const out: SandboxSnapshot = {};
    for (const line of list.stdout.split("\n")) {
      const rel = line.replace(/^\.\//, "").trim();
      if (!rel) continue;
      const full = containerPath(WORKDIR, rel);
      const r = await this.docker(["exec", this.containerId, "sh", "-c", `base64 ${shq(full)}`], {
        maxBytes: FILE_READ_CAP,
      });
      assertOk(`snapshot:read ${rel}`, r);
      if (r.truncated)
        throw new Error(`snapshot truncated (file exceeds ${FILE_READ_CAP} bytes): ${rel}`);
      out[rel] = r.stdout.replace(/\s+/g, "");
    }
    return out;
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
    // Fail closed: no network by default; a non-empty allowlist is not yet
    // enforceable, so reject it rather than silently opening the network.
    if (opts.limits?.egressAllowlist?.length) {
      throw new Error("egress allowlist is not yet enforced; refusing to open the network");
    }

    const run = await spawnCapture("docker", [
      "run",
      "-d",
      "--rm",
      ...limitArgs,
      "--network",
      "none",
      "-w",
      WORKDIR,
      image,
      "sleep",
      "infinity",
    ]);
    if (run.exitCode !== 0) throw new Error(`docker run failed: ${run.stderr.trim()}`);
    const containerId = run.stdout.trim();

    try {
      assertOk(
        "mkdir workdir",
        await spawnCapture("docker", ["exec", containerId, "mkdir", "-p", WORKDIR]),
      );
      const ws = opts.workspace;
      if (ws?.kind === "dir") {
        assertOk(
          "docker cp",
          await spawnCapture("docker", ["cp", `${ws.path}/.`, `${containerId}:${WORKDIR}`]),
        );
      } else if (ws?.kind === "snapshot") {
        for (const [rel, b64] of Object.entries(ws.snapshot)) {
          const full = containerPath(WORKDIR, rel);
          assertOk(
            `restore ${rel}`,
            await spawnCapture(
              "docker",
              [
                "exec",
                "-i",
                containerId,
                "sh",
                "-c",
                `mkdir -p "$(dirname ${shq(full)})" && base64 -d > ${shq(full)}`,
              ],
              { input: b64 },
            ),
          );
        }
      }
    } catch (err) {
      await spawnCapture("docker", ["rm", "-f", containerId]);
      throw err;
    }

    return new DockerSandbox(newId("sbx"), containerId);
  }
}
