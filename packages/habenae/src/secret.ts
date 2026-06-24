import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Symmetric secret encryption for provider credentials stored in the config file.
 * AES-256-GCM with a key derived from the master secret (`AURIGA_CONFIG_SECRET`).
 * The blob is self-describing (`v1:<iv>:<tag>:<ciphertext>`, all base64) so a future
 * scheme can bump the version. Server-only — lives in habenae, not core, so SDK and
 * browser bundles never pull in node:crypto here.
 */

const VERSION = "v1";
// A fixed salt keeps derivation deterministic for a given master secret (we have no
// per-record salt store); the per-message IV provides semantic security.
const SALT = "auriga.config.secret.v1";

function deriveKey(secret: string): Buffer {
  if (!secret) throw new Error("a non-empty master secret is required");
  return scryptSync(secret, SALT, 32);
}

/** Encrypt a UTF-8 string. Returns `v1:<iv>:<tag>:<ciphertext>` (base64 parts). */
export function encryptSecret(plaintext: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a blob produced by {@link encryptSecret}. Throws on a wrong key or tamper. */
export function decryptSecret(blob: string, secret: string): string {
  const [version, ivB64, tagB64, ctB64] = blob.split(":");
  if (version !== VERSION || !ivB64 || !tagB64 || ctB64 === undefined) {
    throw new Error("malformed encrypted secret");
  }
  const key = deriveKey(secret);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString(
    "utf8",
  );
}
