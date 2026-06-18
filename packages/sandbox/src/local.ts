import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { newId } from "@auriga/core";
import { spawnCapture } from "./spawn";
import type {
  CreateSandboxOptions,
  ExecOptions,
  ExecResult,
  Sandbox,
  SandboxDriver,
} from "./types";

/**
 * A sandbox backed by a temp directory and host subprocesses. NO isolation —
 * for trusted dev/test only (e.g. running the harness on this machine without
 * Docker). The DockerSandbox provides real isolation behind the same interface.
 */
class LocalSandbox implements Sandbox {
  constructor(
    readonly id: string,
    private readonly root: string,
  ) {}

  async exec(cmd: string, opts: ExecOptions = {}): Promise<ExecResult> {
    return spawnCapture("sh", ["-c", cmd], {
      cwd: opts.cwd ? join(this.root, opts.cwd) : this.root,
      ...(opts.env ? { env: opts.env } : {}),
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    });
  }

  async readFile(path: string): Promise<string> {
    return readFile(join(this.root, path), "utf8");
  }

  async writeFile(path: string, content: string): Promise<void> {
    const abs = join(this.root, path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await access(join(this.root, path));
      return true;
    } catch {
      return false;
    }
  }

  async list(dir = "."): Promise<string[]> {
    return readdir(join(this.root, dir));
  }

  async mountSkill(name: string, files: Record<string, Uint8Array>): Promise<string> {
    const rel = join(".skills", name);
    for (const [path, bytes] of Object.entries(files)) {
      const abs = join(this.root, rel, path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, bytes);
    }
    return rel;
  }

  async destroy(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}

export class LocalSandboxDriver implements SandboxDriver {
  readonly name = "local";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async create(opts: CreateSandboxOptions = {}): Promise<Sandbox> {
    const root = await mkdtemp(join(tmpdir(), "auriga-sbx-"));
    if (opts.workspace?.kind === "dir") {
      await cp(opts.workspace.path, root, { recursive: true });
    }
    return new LocalSandbox(newId("sbx"), root);
  }
}
