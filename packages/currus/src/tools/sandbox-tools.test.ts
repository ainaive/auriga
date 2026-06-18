import { test, expect } from "bun:test";
import { LocalSandboxDriver, type Sandbox } from "@auriga/sandbox";
import { ToolDispatcher } from "../dispatcher";
import { makeSandboxTools } from "./sandbox-tools";

async function setup(): Promise<{ sandbox: Sandbox; dispatcher: ToolDispatcher }> {
  const sandbox = await new LocalSandboxDriver().create({ workspace: { kind: "empty" } });
  return { sandbox, dispatcher: new ToolDispatcher(makeSandboxTools(sandbox)) };
}

test("write_file then read_file round trips", async () => {
  const { sandbox, dispatcher } = await setup();
  try {
    const w = await dispatcher.dispatch("write_file", { path: "src/a.ts", content: "export const x = 1;" });
    expect(w.isError).toBe(false);
    const r = await dispatcher.dispatch("read_file", { path: "src/a.ts" });
    expect(r.content).toContain("export const x = 1;");
  } finally {
    await sandbox.destroy();
  }
});

test("read_file on a missing path is an error result", async () => {
  const { sandbox, dispatcher } = await setup();
  try {
    const r = await dispatcher.dispatch("read_file", { path: "nope.txt" });
    expect(r.isError).toBe(true);
  } finally {
    await sandbox.destroy();
  }
});

test("bash runs in the workspace and reports exit code", async () => {
  const { sandbox, dispatcher } = await setup();
  try {
    await dispatcher.dispatch("write_file", { path: "hi.txt", content: "yo" });
    const r = await dispatcher.dispatch("bash", { cmd: "cat hi.txt" });
    expect(r.content).toContain("yo");
    expect(r.content).toContain("exit: 0");
  } finally {
    await sandbox.destroy();
  }
});

test("list_dir lists entries", async () => {
  const { sandbox, dispatcher } = await setup();
  try {
    await dispatcher.dispatch("write_file", { path: "x.txt", content: "1" });
    const r = await dispatcher.dispatch("list_dir", {});
    expect(r.content).toContain("x.txt");
  } finally {
    await sandbox.destroy();
  }
});

test("search finds a pattern and reports no matches otherwise", async () => {
  const { sandbox, dispatcher } = await setup();
  try {
    await dispatcher.dispatch("write_file", { path: "a.txt", content: "find the needle here" });
    const hit = await dispatcher.dispatch("search", { pattern: "needle" });
    expect(hit.content).toContain("a.txt");
    const miss = await dispatcher.dispatch("search", { pattern: "zzz-not-present" });
    expect(miss.content).toBe("no matches");
  } finally {
    await sandbox.destroy();
  }
});

test("git runs in the workspace with tokenized args", async () => {
  const { sandbox, dispatcher } = await setup();
  try {
    const r = await dispatcher.dispatch("git", { args: ["init"] });
    expect(r.content).toContain("exit: 0");
  } finally {
    await sandbox.destroy();
  }
});

test("git rejects a non-array args payload (no shell injection)", async () => {
  const { sandbox, dispatcher } = await setup();
  try {
    const r = await dispatcher.dispatch("git", { args: "status; echo pwned" });
    expect(r.isError).toBe(true);
    expect(r.content).toContain("string[]");
  } finally {
    await sandbox.destroy();
  }
});
