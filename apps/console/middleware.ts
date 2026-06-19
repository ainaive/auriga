import { NextResponse, type NextRequest } from "next/server";

// Require a dev session for everything except the login page. The session is an
// HTTP-only cookie set by the login action (see lib/session.ts). This gate validates
// the cookie SHAPE (not a signature) — it is NOT a security boundary: the API trusts
// the x-auriga-* headers behind a proxy. It just keeps the console behind a sign-in.

/** True only for a well-formed `{ factio, role }` session cookie. */
function validSession(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    const p = JSON.parse(raw) as { factio?: unknown; role?: unknown };
    return typeof p.factio === "string" && !!p.factio && typeof p.role === "string" && !!p.role;
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (validSession(req.cookies.get("auriga_session")?.value)) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on all routes except Next internals + static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
