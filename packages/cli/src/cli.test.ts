import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

const SAMPLE_SPEC = {
  id: "job_cli",
  factio: "acme",
  created_by: "u",
  goal: "g",
  context_refs: { workspace: { kind: "dir", url_or_path: "/tmp" } },
  allowed_tools: ["write_file"],
  acceptance_criteria: [{ kind: "file_exists", path: "answer.txt" }],
  budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
};

async function runCli(args: string[], home: string, extraEnv: Record<string, string> = {}) {
  const proc = Bun.spawn(["bun", MAIN, ...args], {
    env: { ...process.env, AURIGA_HOME: home, ...extraEnv },
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

test("create then list --factio shows the tenant's job", async () => {
  const home = await mkdtemp(join(tmpdir(), "auriga-cli-"));
  const specDir = await mkdtemp(join(tmpdir(), "auriga-spec-")); // keep the spec out of the store dir
  const specFile = join(specDir, "spec.json");
  try {
    await writeFile(specFile, JSON.stringify(SAMPLE_SPEC));
    const created = await runCli(["create", specFile], home);
    expect(created.code).toBe(0);
    expect(created.stdout).toContain("created job_cli");

    const listed = await runCli(["list", "--factio", "acme"], home);
    expect(listed.stdout).toContain("job_cli");
    expect(listed.stdout).toContain("[acme]");

    const other = await runCli(["list", "--factio", "nobody"], home);
    expect(other.stdout).toContain("no jobs in factio nobody");
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(specDir, { recursive: true, force: true });
  }
});

test("schedule on an empty store reports no pending jobs", async () => {
  const home = await mkdtemp(join(tmpdir(), "auriga-cli-"));
  try {
    const r = await runCli(["schedule"], home);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("no pending jobs");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("audit and dashboard reflect a created job", async () => {
  const home = await mkdtemp(join(tmpdir(), "auriga-cli-"));
  const specDir = await mkdtemp(join(tmpdir(), "auriga-spec-"));
  const specFile = join(specDir, "spec.json");
  try {
    await writeFile(specFile, JSON.stringify(SAMPLE_SPEC));
    await runCli(["create", specFile], home);

    const audit = await runCli(["audit"], home);
    expect(audit.stdout).toContain("job.created");
    expect(audit.stdout).toContain("[acme]");

    const dash = await runCli(["dashboard"], home);
    expect(dash.stdout).toContain("1 jobs");
    expect(dash.stdout).toContain("[acme]");
  } finally {
    await rm(home, { recursive: true, force: true });
    await rm(specDir, { recursive: true, force: true });
  }
});

test("skills without AURIGA_SKILLS exits non-zero", async () => {
  const home = await mkdtemp(join(tmpdir(), "auriga-cli-"));
  try {
    const r = await runCli(["skills"], home, { AURIGA_SKILLS: "" }); // ensure unset/empty
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("AURIGA_SKILLS");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
