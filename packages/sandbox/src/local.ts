import { access, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, sep } from "node:path";
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

function excluded(rel: string): boolean {
  return (
    rel === ".git" ||
    rel.startsWith(".git/") ||
    rel === "node_modules" ||
    rel.startsWith("node_modules/") ||
    rel.includes("/node_modules/")
  );
}

async function walkFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    const rel = relative(base, abs).split(sep).join("/");
    if (excluded(rel)) continue;
    if (entry.isDirectory()) out.push(...(await walkFiles(abs, base)));
    else out.push(abs);
  }
  return out;
}

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

  async snapshot(): Promise<SandboxSnapshot> {
    const out: SandboxSnapshot = {};
    for (const abs of await walkFiles(this.root)) {
      const rel = relative(this.root, abs).split(sep).join("/");
      out[rel] = (await readFile(abs)).toString("base64");
    }
    return out;
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
    const ws = opts.workspace;
    if (ws?.kind === "dir") {
      await cp(ws.path, root, { recursive: true });
    } else if (ws?.kind === "snapshot") {
      for (const [rel, b64] of Object.entries(ws.snapshot)) {
        const abs = join(root, rel);
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, Buffer.from(b64, "base64"));
      }
    }
    return new LocalSandbox(newId("sbx"), root);
  }
}
