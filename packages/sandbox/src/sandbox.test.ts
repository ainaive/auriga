import { test, expect, describe } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DockerSandboxDriver } from "./docker";
import { LocalSandboxDriver } from "./local";
import type { SandboxDriver } from "./types";

/** Shared behavior every driver must satisfy. */
function sandboxContract(makeDriver: () => SandboxDriver) {
  test("write → read → exists → list", async () => {
    const sbx = await makeDriver().create({ workspace: { kind: "empty" } });
    try {
      await sbx.writeFile("src/a.txt", "hello");
      expect(await sbx.readFile("src/a.txt")).toBe("hello");
      expect(await sbx.exists("src/a.txt")).toBe(true);
      expect(await sbx.exists("nope.txt")).toBe(false);
      expect(await sbx.list("src")).toContain("a.txt");
    } finally {
      await sbx.destroy();
    }
  });

  test("exec captures stdout and exit codes", async () => {
    const sbx = await makeDriver().create({ workspace: { kind: "empty" } });
    try {
      await sbx.writeFile("a.txt", "world");
      const ok = await sbx.exec("echo hi && cat a.txt");
      expect(ok.exitCode).toBe(0);
      expect(ok.stdout).toContain("hi");
      expect(ok.stdout).toContain("world");

      const fail = await sbx.exec("exit 3");
      expect(fail.exitCode).toBe(3);
    } finally {
      await sbx.destroy();
    }
  });

  test("mountSkill places files under the mount root", async () => {
    const sbx = await makeDriver().create({ workspace: { kind: "empty" } });
    try {
      const mount = await sbx.mountSkill("demo", {
        "SKILL.md": new TextEncoder().encode("# demo"),
        "reference/x.md": new TextEncoder().encode("ref"),
      });
      expect(await sbx.readFile(`${mount}/SKILL.md`)).toBe("# demo");
      expect(await sbx.readFile(`${mount}/reference/x.md`)).toBe("ref");
    } finally {
      await sbx.destroy();
    }
  });

  test("snapshot → restore into a new sandbox preserves files", async () => {
    const driver = makeDriver();
    const first = await driver.create({ workspace: { kind: "empty" } });
    let snapshot;
    try {
      await first.writeFile("src/a.ts", "const a = 1;");
      await first.writeFile("notes.md", "hello");
      snapshot = await first.snapshot();
      expect(Object.keys(snapshot)).toContain("src/a.ts");
    } finally {
      await first.destroy();
    }
    const second = await driver.create({ workspace: { kind: "snapshot", snapshot } });
    try {
      expect(await second.readFile("src/a.ts")).toBe("const a = 1;");
      expect(await second.readFile("notes.md")).toBe("hello");
    } finally {
      await second.destroy();
    }
  });
}

describe("LocalSandbox", () => {
  sandboxContract(() => new LocalSandboxDriver());

  test("seeds the workspace from a host directory", async () => {
    const src = await mkdtemp(join(tmpdir(), "auriga-src-"));
    await writeFile(join(src, "pkg.txt"), "v1");
    const sbx = await new LocalSandboxDriver().create({ workspace: { kind: "dir", path: src } });
    try {
      expect(await sbx.readFile("pkg.txt")).toBe("v1");
    } finally {
      await sbx.destroy();
      await rm(src, { recursive: true, force: true });
    }
  });

  test("destroy removes the workspace", async () => {
    const sbx = await new LocalSandboxDriver().create({ workspace: { kind: "empty" } });
    await sbx.writeFile("a.txt", "x");
    await sbx.destroy();
    expect(await sbx.exists("a.txt")).toBe(false);
  });

  test("rejects paths that escape the workspace root", async () => {
    const sbx = await new LocalSandboxDriver().create({ workspace: { kind: "empty" } });
    try {
      await expect(sbx.readFile("../../etc/passwd")).rejects.toThrow(/escapes workspace/);
      await expect(sbx.writeFile("../escape.txt", "x")).rejects.toThrow(/escapes workspace/);
    } finally {
      await sbx.destroy();
    }
  });
});

// Docker integration tests are heavy (image pull + containers) and contend with
// the rest of the suite on CI runners, so they're opt-in: set AURIGA_DOCKER_TESTS=1
// (with Docker available) to run them.
const runDocker =
  process.env.AURIGA_DOCKER_TESTS === "1" && (await new DockerSandboxDriver().isAvailable());

describe.if(runDocker)("DockerSandbox (AURIGA_DOCKER_TESTS=1)", () => {
  sandboxContract(() => new DockerSandboxDriver());
});

if (!runDocker) {
  test.skip("DockerSandbox (opt-in via AURIGA_DOCKER_TESTS=1)", () => {});
}
