import { test, expect } from "bun:test";
import { decryptSecret, encryptSecret } from "./secret";

test("encrypt → decrypt round-trips with the same secret", () => {
  const blob = encryptSecret("sk-deepseek-123", "master-key");
  expect(blob.startsWith("v1:")).toBe(true);
  // The ciphertext does not contain the plaintext.
  expect(blob).not.toContain("sk-deepseek-123");
  expect(decryptSecret(blob, "master-key")).toBe("sk-deepseek-123");
});

test("a fresh IV makes each ciphertext distinct", () => {
  const a = encryptSecret("same", "key");
  const b = encryptSecret("same", "key");
  expect(a).not.toBe(b);
  expect(decryptSecret(a, "key")).toBe("same");
  expect(decryptSecret(b, "key")).toBe("same");
});

test("a wrong key fails to decrypt", () => {
  const blob = encryptSecret("secret", "right-key");
  expect(() => decryptSecret(blob, "wrong-key")).toThrow();
});

test("a tampered blob fails the auth tag", () => {
  const blob = encryptSecret("secret", "key");
  const [v, iv, tag, ctB64] = blob.split(":");
  const ct = Buffer.from(ctB64 ?? "", "base64");
  ct[0] = (ct[0] ?? 0) ^ 0xff; // flip a bit
  const tampered = `${v}:${iv}:${tag}:${ct.toString("base64")}`;
  expect(() => decryptSecret(tampered, "key")).toThrow();
});

test("a malformed blob is rejected", () => {
  expect(() => decryptSecret("not-a-blob", "key")).toThrow("malformed");
  expect(() => encryptSecret("x", "")).toThrow();
});
