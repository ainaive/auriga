import type { ExecResult } from "./types";

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  /** Written to the process stdin, then closed. */
  input?: string;
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

  const stdoutP = new Response(proc.stdout).text();
  const stderrP = new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  if (timer) clearTimeout(timer);
  const [stdout, stderr] = await Promise.all([stdoutP, stderrP]);

  return { exitCode, stdout, stderr, timedOut };
}
