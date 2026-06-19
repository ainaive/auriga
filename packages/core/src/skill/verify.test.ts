import { test, expect } from "bun:test";
import { b64Encode } from "./bytes";
import { generateSigningKeypair, signContentHash, type Ed25519Keypair } from "./crypto";
import { computeContentHash, sha256Hex } from "./hash";
import { verifyArtifact } from "./verify";
import type { SignedSkillArtifact, SkillFileEntry, VerificationKey } from "./types";

const FILE_BODY = new TextEncoder().encode("hello reference");

async function buildSignedArtifact(kp: Ed25519Keypair): Promise<SignedSkillArtifact> {
  const file: SkillFileEntry = {
    path: "reference/a.md",
    hash: await sha256Hex(FILE_BODY),
    size: FILE_BODY.length,
  };
  const content = {
    name: "demo",
    version: "1.0.0",
    description: "demo skill",
    type: "knowledge" as const,
    skill_md: "# demo",
    files: [file],
  };
  const content_hash = await computeContentHash(content);
  const signature = await signContentHash(content_hash, kp.private_key);
  return {
    manifest: { ...content, content_hash },
    skill_md: content.skill_md,
    blobs: { "reference/a.md": b64Encode(FILE_BODY) },
    signature,
    key_id: kp.key_id,
  };
}

async function setup(): Promise<{
  kp: Ed25519Keypair;
  keys: VerificationKey[];
  artifact: SignedSkillArtifact;
}> {
  const kp = await generateSigningKeypair("platform-1");
  const artifact = await buildSignedArtifact(kp);
  return { kp, keys: [{ key_id: kp.key_id, public_key: kp.public_key }], artifact };
}

test("a correctly signed artifact verifies", async () => {
  const { keys, artifact } = await setup();
  expect(await verifyArtifact(artifact, keys)).toEqual({ ok: true });
});

test("an unknown key_id is rejected", async () => {
  const { artifact } = await setup();
  const result = await verifyArtifact(artifact, []);
  expect(result.ok).toBe(false);
  expect(result.reason).toContain("unknown signing key_id");
});

test("a tampered SKILL.md body is rejected (content hash mismatch)", async () => {
  const { keys, artifact } = await setup();
  const tampered = { ...artifact, skill_md: "# evil" };
  const result = await verifyArtifact(tampered, keys);
  expect(result.ok).toBe(false);
  expect(result.reason).toContain("content hash mismatch");
});

test("a tampered blob is rejected (blob hash mismatch)", async () => {
  const { keys, artifact } = await setup();
  const tampered: SignedSkillArtifact = {
    ...artifact,
    blobs: { "reference/a.md": b64Encode(new TextEncoder().encode("evil payload")) },
  };
  const result = await verifyArtifact(tampered, keys);
  expect(result.ok).toBe(false);
  expect(result.reason).toContain("blob hash mismatch");
});

test("a wrong signature is rejected", async () => {
  const { kp, keys, artifact } = await setup();
  // sign a different hash with the same key — valid signature, wrong payload
  const tampered: SignedSkillArtifact = {
    ...artifact,
    signature: await signContentHash("00".repeat(32), kp.private_key),
  };
  const result = await verifyArtifact(tampered, keys);
  expect(result.ok).toBe(false);
  expect(result.reason).toContain("signature verification failed");
});
