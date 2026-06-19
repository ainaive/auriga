import { b64Decode } from "./bytes";
import { verifyContentHash } from "./crypto";
import { computeContentHash, sha256Hex } from "./hash";
import type { SignedSkillArtifact, SkillVerificationResult, VerificationKey } from "./types";

/**
 * Verify a fetched skill before mounting (supply-chain security — never skip).
 * Three checks, all must pass:
 *   1. every bundled blob matches its manifest file hash,
 *   2. the recomputed content hash equals manifest.content_hash,
 *   3. the ed25519 signature over content_hash verifies against a trusted key.
 * Returns ok:false with a reason rather than throwing, so callers can record it.
 */
export async function verifyArtifact(
  artifact: SignedSkillArtifact,
  keys: readonly VerificationKey[],
): Promise<SkillVerificationResult> {
  const key = keys.find((k) => k.key_id === artifact.key_id);
  if (!key) return { ok: false, reason: `unknown signing key_id: ${artifact.key_id}` };

  // 1. blobs match the manifest's per-file hashes
  for (const file of artifact.manifest.files) {
    const blob = artifact.blobs[file.path];
    if (blob === undefined) return { ok: false, reason: `missing blob: ${file.path}` };
    const actual = await sha256Hex(b64Decode(blob));
    if (actual !== file.hash) {
      return { ok: false, reason: `blob hash mismatch: ${file.path}` };
    }
  }

  // 2. content hash recomputes to the manifest's declared address
  const recomputed = await computeContentHash({
    name: artifact.manifest.name,
    version: artifact.manifest.version,
    description: artifact.manifest.description,
    type: artifact.manifest.type,
    skill_md: artifact.skill_md,
    files: artifact.manifest.files,
    ...(artifact.manifest.entrypoints ? { entrypoints: artifact.manifest.entrypoints } : {}),
  });
  if (recomputed !== artifact.manifest.content_hash) {
    return { ok: false, reason: "content hash mismatch" };
  }

  // 3. signature over the content hash
  const sigOk = await verifyContentHash(
    artifact.manifest.content_hash,
    artifact.signature,
    key.public_key,
  );
  if (!sigOk) return { ok: false, reason: "signature verification failed" };

  return { ok: true };
}
