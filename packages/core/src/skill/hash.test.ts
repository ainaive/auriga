import { test, expect } from "bun:test";
import { computeContentHash, sha256Hex } from "./hash";
import type { SkillContentForHash } from "./types";

test("sha256Hex matches the known vector for 'abc'", async () => {
  expect(await sha256Hex("abc")).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

const base: SkillContentForHash = {
  name: "fix-failing-test",
  version: "1.0.0",
  description: "Locate and fix a failing test.",
  type: "knowledge",
  skill_md: "# Fix failing test\n...",
  files: [
    { path: "reference/a.md", hash: "aa", size: 1 },
    { path: "reference/b.md", hash: "bb", size: 2 },
  ],
};

test("content hash is stable across runs", async () => {
  expect(await computeContentHash(base)).toBe(await computeContentHash(base));
});

test("content hash is independent of file ordering", async () => {
  const reordered: SkillContentForHash = {
    ...base,
    files: [...base.files].reverse(),
  };
  expect(await computeContentHash(reordered)).toBe(await computeContentHash(base));
});

test("changing the SKILL.md body changes the hash", async () => {
  const changed: SkillContentForHash = { ...base, skill_md: "# different" };
  expect(await computeContentHash(changed)).not.toBe(await computeContentHash(base));
});

test("changing a file hash changes the content hash", async () => {
  const changed: SkillContentForHash = {
    ...base,
    files: [{ path: "reference/a.md", hash: "ZZ", size: 1 }, base.files[1]!],
  };
  expect(await computeContentHash(changed)).not.toBe(await computeContentHash(base));
});
