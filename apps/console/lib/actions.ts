"use server";

// Server Actions for the console's write operations. These run on the Next server
// (not the browser), so they reach the control-plane API server-to-server with the
// same auth headers the reads use — no CORS, and the API is never exposed to the
// client. The API is unchanged: createJob → POST /jobs, approveJob → POST /jobs/:id/approve.

import { revalidatePath } from "next/cache";
import { authHeaders, BASE } from "./api";

export type CreateResult = { ok: true; id: string } | { ok: false; error: string };
export type ApproveResult = { ok: true } | { ok: false; error: string };
export type RunResult = { ok: true } | { ok: false; error: string };
export type CancelResult = { ok: true } | { ok: false; error: string };

/** Read an `{ error }` body if present, else fall back to the HTTP status text. */
async function errorOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // non-JSON body
  }
  return `request failed (${res.status})`;
}

/** Create a pending job from a raw JSON spec string (as authored in the CLI/ChatOps). */
export async function createJob(specJson: string): Promise<CreateResult> {
  let spec: unknown;
  try {
    spec = JSON.parse(specJson);
  } catch {
    return { ok: false, error: "spec is not valid JSON" };
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}/jobs`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ spec }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "API unreachable" };
  }
  if (!res.ok) return { ok: false, error: await errorOf(res) };
  const record = (await res.json()) as { id: string };
  revalidatePath("/jobs");
  return { ok: true, id: record.id };
}

/** Approve a paused job (HITL gate). */
export async function approveJob(id: string): Promise<ApproveResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/jobs/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      headers: authHeaders,
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "API unreachable" };
  }
  if (!res.ok) return { ok: false, error: await errorOf(res) };
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
  return { ok: true };
}

/** Request cancellation of a job (cooperative — an active run stops at its next checkpoint). */
export async function cancelJob(id: string): Promise<CancelResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/jobs/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      headers: authHeaders,
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "API unreachable" };
  }
  if (!res.ok) return { ok: false, error: await errorOf(res) };
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
  return { ok: true };
}

/** Kick a job to run in the background (dev-grade in-process execution; needs ANTHROPIC_API_KEY). */
export async function runJob(id: string): Promise<RunResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/jobs/${encodeURIComponent(id)}/run`, {
      method: "POST",
      headers: authHeaders,
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "API unreachable" };
  }
  if (!res.ok) return { ok: false, error: await errorOf(res) };
  revalidatePath(`/jobs/${id}`);
  revalidatePath("/jobs");
  return { ok: true };
}
