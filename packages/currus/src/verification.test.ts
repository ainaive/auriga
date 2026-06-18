import { test, expect } from "bun:test";
import { LocalSandboxDriver, type Sandbox } from "@auriga/sandbox";
import { VerificationGate } from "./verification";

async function sandbox(): Promise<Sandbox> {
  return new LocalSandboxDriver().create({ workspace: { kind: "empty" } });
}

test("command criterion passes on the expected exit code", async () => {
  const sbx = await sandbox();
  try {
    const r = await new VerificationGate().verify(sbx, [
      { kind: "command", cmd: "exit 0", expect_exit: 0 },
    ]);
    expect(r.passed).toBe(true);
  } finally {
    await sbx.destroy();
  }
});

test("command criterion fails on a wrong exit code and records evidence", async () => {
  const sbx = await sandbox();
  try {
    const r = await new VerificationGate().verify(sbx, [
      { kind: "command", cmd: "echo boom; exit 1", expect_exit: 0 },
    ]);
    expect(r.passed).toBe(false);
    expect(r.results[0]?.evidence).toContain("boom");
    expect(r.results[0]?.evidence).toContain("exit 1");
  } finally {
    await sbx.destroy();
  }
});

test("file_exists criterion reflects the filesystem", async () => {
  const sbx = await sandbox();
  try {
    await sbx.writeFile("present.txt", "x");
    const r = await new VerificationGate().verify(sbx, [
      { kind: "file_exists", path: "present.txt" },
      { kind: "file_exists", path: "absent.txt" },
    ]);
    expect(r.results[0]?.passed).toBe(true);
    expect(r.results[1]?.passed).toBe(false);
    expect(r.passed).toBe(false); // all must pass
  } finally {
    await sbx.destroy();
  }
});

test("unregistered named_check fails", async () => {
  const sbx = await sandbox();
  try {
    const r = await new VerificationGate().verify(sbx, [{ kind: "named_check", name: "lint" }]);
    expect(r.passed).toBe(false);
    expect(r.results[0]?.evidence).toContain("not registered");
  } finally {
    await sbx.destroy();
  }
});

test("registered named_check runs", async () => {
  const sbx = await sandbox();
  try {
    const gate = new VerificationGate({
      lint: async () => ({ passed: true, evidence: "0 lint errors" }),
    });
    const r = await gate.verify(sbx, [{ kind: "named_check", name: "lint" }]);
    expect(r.passed).toBe(true);
    expect(r.results[0]?.evidence).toBe("0 lint errors");
  } finally {
    await sbx.destroy();
  }
});

test("empty criteria do not pass (nothing verified)", async () => {
  const sbx = await sandbox();
  try {
    const r = await new VerificationGate().verify(sbx, []);
    expect(r.passed).toBe(false);
  } finally {
    await sbx.destroy();
  }
});
