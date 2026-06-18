import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { SkillEntrypoint, SkillType } from "@auriga/core";

/** A single bundled file, ready to be hashed and stored. */
export interface SkillBundleFile {
  /** Bundle-relative, posix-style path. */
  path: string;
  bytes: Uint8Array;
  executable?: boolean;
}

/** A skill ready to publish (before hashing/signing). */
export interface SkillBundleInput {
  name: string;
  version: string;
  description: string;
  type: SkillType;
  skill_md: string;
  files: SkillBundleFile[];
  entrypoints?: SkillEntrypoint[];
}

interface SkillDescriptor {
  name: string;
  version: string;
  description: string;
  type: SkillType;
  entrypoints?: SkillEntrypoint[];
}

const RESERVED = new Set(["skill.json", "SKILL.md"]);

/**
 * Load a skill bundle from a directory laid out as:
 *   skill.json   (name, version, description, type, entrypoints?)
 *   SKILL.md     (the procedural-knowledge body)
 *   <anything else>   (bundled reference files / scripts)
 */
export async function loadBundleFromDir(dir: string): Promise<SkillBundleInput> {
  const descriptor = JSON.parse(
    await readFile(join(dir, "skill.json"), "utf8"),
  ) as SkillDescriptor;
  const skill_md = await readFile(join(dir, "SKILL.md"), "utf8");

  const files: SkillBundleFile[] = [];
  for (const abs of await walk(dir)) {
    const rel = relative(dir, abs).split(sep).join("/");
    if (RESERVED.has(rel)) continue;
    files.push({ path: rel, bytes: new Uint8Array(await readFile(abs)) });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    name: descriptor.name,
    version: descriptor.version,
    description: descriptor.description,
    type: descriptor.type,
    skill_md,
    files,
    ...(descriptor.entrypoints ? { entrypoints: descriptor.entrypoints } : {}),
  };
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(abs)));
    else out.push(abs);
  }
  return out;
}
