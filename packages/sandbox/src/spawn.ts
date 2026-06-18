import type { ExecResult } from "./types";

/** Hard cap on captured stdout/stderr (bytes) to bound memory under adversarial output. */
const MAX_CAPTURE_BYTES = 1_000_000;

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  /** Written to the process stdin, then closed. */
  input?: string;
  /** Override the per-stream capture byte cap. */
  maxBytes?: number;
}

/** Read a stream up to `maxBytes`, marking truncation; always drains the stream. */
async function readCapped(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total < maxBytes) {
      const remaining = maxBytes - total;
      if (value.byteLength <= remaining) {
        chunks.push(value);
        total += value.byteLength;
      } else {
        chunks.push(value.subarray(0, remaining));
        total += remaining;
        truncated = true;
      }
    } else {
      truncated = true;
    }
  }
  let text = Buffer.concat(chunks).toString("utf8");
  if (truncated) text += `\n…[output truncated at ${maxBytes} bytes]`;
  return text;
}

/** Spawn a process, capture stdout/stderr/exit, with an optional timeout. */
export async function spawnCapture(
  cmd: string,
  args: string[],
  opts: SpawnOptions = {},
): Promise<ExecResult> {
  const proc = Bun.spawn([cmd, ...args], {
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
    env: opts.env ? { ...process.env, ...opts.env } : process.env,
    stdin: opts.input !== undefined ? new TextEncoder().encode(opts.input) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  let timedOut = false;
  const timer =
    opts.timeoutMs !== undefined
      ? setTimeout(() => {
          timedOut = true;
          proc.kill();
        }, opts.timeoutMs)
      : undefined;

  const cap = opts.maxBytes ?? MAX_CAPTURE_BYTES;
  const stdoutP = readCapped(proc.stdout, cap);
  const stderrP = readCapped(proc.stderr, cap);
  const exitCode = await proc.exited;
  if (timer) clearTimeout(timer);
  const [stdout, stderr] = await Promise.all([stdoutP, stderrP]);

  return { exitCode, stdout, stderr, timedOut };
}
