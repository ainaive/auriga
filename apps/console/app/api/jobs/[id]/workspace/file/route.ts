import { authHeaders, BASE } from "@/lib/api";

// Same-origin proxy for a single workspace file: the client component fetches this
// route (cookie auth via middleware); we attach the resolved x-auriga-* headers
// server-side and forward to the control plane. Mirrors the SSE proxy route.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const path = new URL(req.url).searchParams.get("path");
  if (!path) return json({ error: "path required" }, 400);

  let upstream: Response;
  try {
    upstream = await fetch(
      `${BASE}/jobs/${encodeURIComponent(id)}/workspace/file?path=${encodeURIComponent(path)}`,
      { headers: await authHeaders(), cache: "no-store", signal: AbortSignal.timeout(10_000) },
    );
  } catch {
    return json({ error: "control plane unreachable" }, 502);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
