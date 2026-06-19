import { authHeaders, BASE } from "@/lib/api";

// SSE terminates in Next: the browser's EventSource hits this same-origin route
// with its session cookie; we attach the resolved x-auriga-* headers server-side
// and pipe the control-plane stream straight through. `Last-Event-ID` / ?after=
// flow upstream so a reconnecting client backfills what it missed. The upstream
// fetch shares the request's abort signal, so a client disconnect unsubscribes
// the control-plane bus.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const after = new URL(req.url).searchParams.get("after");
  const lastEventId = req.headers.get("last-event-id");
  const qs = after ? `?after=${encodeURIComponent(after)}` : "";

  let upstream: Response;
  try {
    upstream = await fetch(`${BASE}/jobs/${encodeURIComponent(id)}/events${qs}`, {
      headers: {
        ...(await authHeaders()),
        accept: "text/event-stream",
        ...(lastEventId ? { "last-event-id": lastEventId } : {}),
      },
      cache: "no-store",
      signal: req.signal,
    });
  } catch {
    return new Response("control plane unreachable", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.body ?? null, { status: upstream.status });
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
