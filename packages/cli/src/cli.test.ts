import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

async function runCli(args: string[], home: string) {
  const proc = Bun.spawn(["bun", MAIN, ...args], {
    env: { ...process.env, AURIGA_HOME: home },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

test("list shows no jobs in a fresh home", async () => {
  const home = await mkdtemp(join(tmpdir(), "auriga-cli-"));
  try {
    const r = await runCli(["list"], home);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("no jobs");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("status of a missing job exits non-zero", async () => {
  const home = await mkdtemp(join(tmpdir(), "auriga-cli-"));
  try {
    const r = await runCli(["status", "nope"], home);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("not found");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("no command prints usage (incl. new commands) and exits 0", async () => {
  const home = await mkdtemp(join(tmpdir(), "auriga-cli-"));
  try {
    const r = await runCli([], home);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("harness job platform");
    expect(r.stdout).toContain("approve");
    expect(r.stdout).toContain("trace");
    expect(r.stdout).toContain("eval");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("trace and approve on a missing job exit non-zero", async () => {
  const home = await mkdtemp(join(tmpdir(), "auriga-cli-"));
  try {
    expect((await runCli(["trace", "nope"], home)).code).toBe(1);
    expect((await runCli(["approve", "nope"], home)).code).toBe(1);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("eval without a dir exits non-zero", async () => {
  const home = await mkdtemp(join(tmpdir(), "auriga-cli-"));
  try {
    const r = await runCli(["eval"], home);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("usage: auriga eval");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
