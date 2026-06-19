import { bytesToHex, stableStringify, toArrayBufferBacked, utf8Bytes } from "./bytes";
import type { SkillContentForHash } from "./types";

/** sha256 (hex) of a byte array or UTF-8 string. */
export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? utf8Bytes(data) : toArrayBufferBacked(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(digest);
}

/**
 * The content address of a skill: sha256 over a canonical serialization of its
 * content (name, version, description, type, SKILL.md body, and the per-file
 * hashes). Files and entrypoints are sorted so ordering never affects the hash.
 * This is the single canonicalization both the signer (registry) and the verifier
 * (harness) rely on — keep them identical.
 */
export async function computeContentHash(content: SkillContentForHash): Promise<string> {
  return sha256Hex(canonicalizeContent(content));
}

function canonicalizeContent(c: SkillContentForHash): string {
  const ordered = {
    name: c.name,
    version: c.version,
    description: c.description,
    type: c.type,
    skill_md: c.skill_md,
    files: [...c.files]
      .sort((a, b) => compare(a.path, b.path))
      .map((f) => ({
        path: f.path,
        hash: f.hash,
        size: f.size,
        executable: Boolean(f.executable),
      })),
    entrypoints: [...(c.entrypoints ?? [])].sort((a, b) => compare(a.tool_name, b.tool_name)),
  };
  return stableStringify(ordered);
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
