import { createHmac } from "node:crypto";
import { expect, test } from "bun:test";
import { InMemoryJobStore, InMemoryPolicy, type Actor } from "@auriga/habenae";
import { handleSlackCommand, parseSlashCommand, verifySlackSignature } from "./slack";

const SECRET = "shhh";
const TS = "1700000000";

function sign(body: string, ts = TS): string {
  return `v0=${createHmac("sha256", SECRET).update(`v0:${ts}:${body}`).digest("hex")}`;
}

test("verifySlackSignature accepts a valid signature and rejects tampering", () => {
  const body = "text=list";
  const now = Number.parseInt(TS, 10);
  expect(
    verifySlackSignature({
      signingSecret: SECRET,
      timestamp: TS,
      body,
      signature: sign(body),
      now,
    }),
  ).toBe(true);
  expect(
    verifySlackSignature({
      signingSecret: SECRET,
      timestamp: TS,
      body,
      signature: sign("text=other"),
      now,
    }),
  ).toBe(false);
  expect(
    verifySlackSignature({
      signingSecret: "wrong",
      timestamp: TS,
      body,
      signature: sign(body),
      now,
    }),
  ).toBe(false);
});

test("verifySlackSignature rejects stale timestamps (replay)", () => {
  const body = "text=list";
  const now = Number.parseInt(TS, 10) + 3600; // 1h later
  expect(
    verifySlackSignature({
      signingSecret: SECRET,
      timestamp: TS,
      body,
      signature: sign(body),
      now,
    }),
  ).toBe(false);
});

test("parseSlashCommand reads the command text", () => {
  const parsed = parseSlashCommand(
    "token=x&user_id=U1&user_name=alice&command=%2Fauriga&text=status+job_1",
  );
  expect(parsed.text).toBe("status job_1");
  expect(parsed.userId).toBe("U1");
  expect(parsed.userName).toBe("alice");
});

test("handleSlackCommand verifies, parses, and dispatches", async () => {
  const store = new InMemoryJobStore();
  const ctx = {
    store,
    policy: new InMemoryPolicy([{ factio: "acme", roles: ["dev"] }]),
    actor: { factio: "acme", role: "dev" } as Actor,
  };
  const now = Number.parseInt(TS, 10);
  const body = "text=list";

  const ok = await handleSlackCommand({
    signingSecret: SECRET,
    timestamp: TS,
    signature: sign(body),
    body,
    ctx,
    now,
  });
  expect(ok.status).toBe(200);
  expect(ok.reply.text).toBe("(no jobs)");

  const bad = await handleSlackCommand({
    signingSecret: SECRET,
    timestamp: TS,
    signature: "v0=deadbeef",
    body,
    ctx,
    now,
  });
  expect(bad.status).toBe(401);
});
