/** Low-level byte/encoding helpers shared by the skill hashing + crypto layer. */

/**
 * Copy any byte view into a fresh ArrayBuffer-backed Uint8Array. WebCrypto's
 * BufferSource requires `Uint8Array<ArrayBuffer>` (not ...<ArrayBufferLike>), so
 * inputs from Buffer/TextEncoder are normalized here before crypto calls.
 */
export function toArrayBufferBacked(view: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(view.byteLength);
  out.set(view);
  return out;
}

export function utf8Bytes(s: string): Uint8Array<ArrayBuffer> {
  return toArrayBufferBacked(new TextEncoder().encode(s));
}

export function bytesToHex(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export function b64Encode(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return Buffer.from(bytes).toString("base64");
}

export function b64Decode(b64: string): Uint8Array<ArrayBuffer> {
  return toArrayBufferBacked(Buffer.from(b64, "base64"));
}

/**
 * Deterministic JSON: object keys sorted recursively, array order preserved.
 * Used so a skill's content hash is stable regardless of key ordering.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === "object") {
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) out[k] = sortValue(src[k]);
    return out;
  }
  return v;
}
