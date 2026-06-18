import { b64Decode, b64Encode, utf8Bytes } from "./bytes";

/**
 * ed25519 signing primitives over the WebCrypto API (available in Bun and Node).
 * The registry signs a skill's content hash; the harness verifies it before
 * mounting. Signing over the content-hash hex string keeps the signed payload
 * unambiguous and tiny.
 */

const ED25519 = { name: "Ed25519" } as const;

export interface Ed25519Keypair {
  key_id: string;
  /** base64 raw public key. */
  public_key: string;
  /** base64 pkcs8 private key. */
  private_key: string;
}

export async function generateSigningKeypair(key_id: string): Promise<Ed25519Keypair> {
  const pair = (await crypto.subtle.generateKey(ED25519, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey("raw", pair.publicKey);
  const priv = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return { key_id, public_key: b64Encode(pub), private_key: b64Encode(priv) };
}

export async function signContentHash(
  contentHash: string,
  privateKeyPkcs8B64: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    b64Decode(privateKeyPkcs8B64),
    ED25519,
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(ED25519, key, utf8Bytes(contentHash));
  return b64Encode(sig);
}

export async function verifyContentHash(
  contentHash: string,
  signatureB64: string,
  publicKeyRawB64: string,
): Promise<boolean> {
  // Inputs are untrusted: a malformed key/signature must fail closed (false),
  // never throw — otherwise a bad artifact could crash the verifier.
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      b64Decode(publicKeyRawB64),
      ED25519,
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(ED25519, key, b64Decode(signatureB64), utf8Bytes(contentHash));
  } catch {
    return false;
  }
}
