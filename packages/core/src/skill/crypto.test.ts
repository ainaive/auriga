import { test, expect } from "bun:test";
import { generateSigningKeypair, signContentHash, verifyContentHash } from "./crypto";

test("a signature verifies with the matching public key", async () => {
  const kp = await generateSigningKeypair("dev-1");
  const hash = "deadbeef";
  const sig = await signContentHash(hash, kp.private_key);
  expect(await verifyContentHash(hash, sig, kp.public_key)).toBe(true);
});

test("a signature fails against a different key", async () => {
  const kp = await generateSigningKeypair("dev-1");
  const other = await generateSigningKeypair("dev-2");
  const sig = await signContentHash("deadbeef", kp.private_key);
  expect(await verifyContentHash("deadbeef", sig, other.public_key)).toBe(false);
});

test("a tampered payload fails verification", async () => {
  const kp = await generateSigningKeypair("dev-1");
  const sig = await signContentHash("deadbeef", kp.private_key);
  expect(await verifyContentHash("deadbee0", sig, kp.public_key)).toBe(false);
});

test("a malformed key fails closed (returns false, does not throw)", async () => {
  const kp = await generateSigningKeypair("dev-1");
  const sig = await signContentHash("deadbeef", kp.private_key);
  expect(await verifyContentHash("deadbeef", sig, "AAAA")).toBe(false);
  expect(await verifyContentHash("deadbeef", "not-base64-sig!!", kp.public_key)).toBe(false);
});
