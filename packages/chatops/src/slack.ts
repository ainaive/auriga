import { createHmac, timingSafeEqual } from "node:crypto";
import { parseCommand } from "./commands";
import { handleCommand, type ChatContext, type ChatReply } from "./handler";

/** Max age (seconds) for a Slack request before it's rejected as a replay. */
const MAX_SKEW_SECONDS = 300;

/**
 * Verify a Slack request signature (v0 HMAC-SHA256 over `v0:<ts>:<body>`), with a
 * replay window. Returns false on any mismatch — never throws on bad input.
 */
export function verifySlackSignature(opts: {
  signingSecret: string;
  timestamp: string;
  body: string;
  signature: string;
  /** Override "now" (seconds) for deterministic tests. */
  now?: number;
}): boolean {
  const ts = Number.parseInt(opts.timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SECONDS) return false;

  const expected = `v0=${createHmac("sha256", opts.signingSecret).update(`v0:${opts.timestamp}:${opts.body}`).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(opts.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Parse a Slack slash-command (application/x-www-form-urlencoded) payload. */
export function parseSlashCommand(body: string): {
  text: string;
  userId: string;
  userName: string;
} {
  const p = new URLSearchParams(body);
  return {
    text: p.get("text") ?? "",
    userId: p.get("user_id") ?? "",
    userName: p.get("user_name") ?? "",
  };
}

export interface SlackRequest {
  signingSecret: string;
  timestamp: string;
  signature: string;
  body: string;
  ctx: ChatContext;
  now?: number;
}

/**
 * End-to-end Slack handler: verify signature → parse the slash command → dispatch
 * to the control plane. Returns an HTTP-ish status + the reply. (A deployed Slack
 * app wires this to a webhook route; live verification needs a real Slack app.)
 */
export async function handleSlackCommand(
  req: SlackRequest,
): Promise<{ status: number; reply: ChatReply }> {
  const valid = verifySlackSignature({
    signingSecret: req.signingSecret,
    timestamp: req.timestamp,
    body: req.body,
    signature: req.signature,
    ...(req.now !== undefined ? { now: req.now } : {}),
  });
  if (!valid) return { status: 401, reply: { text: "invalid signature" } };

  const { text } = parseSlashCommand(req.body);
  const reply = await handleCommand(parseCommand(text), req.ctx);
  return { status: 200, reply };
}
