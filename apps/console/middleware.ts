import { NextResponse, type NextRequest } from "next/server";

// Require a dev session for everything except the login page. The session is an
// HTTP-only cookie set by the login action (see lib/session.ts).
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (req.cookies.has("auriga_session")) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  // Run on all routes except Next internals + static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
