import { cookies } from "next/headers";

// A dev-grade console session: an HTTP-only cookie carrying the caller's factio + role.
// This is NOT production auth — the API still trusts the headers the console sends, and a
// real deployment sits behind an OIDC proxy. It just replaces the single env identity with
// a switchable, per-browser session.

const COOKIE = "auriga_session";

export interface Actor {
  factio: string;
  role: string;
}

const ENV_DEFAULT: Actor = {
  factio: process.env.AURIGA_FACTIO ?? "default",
  role: process.env.AURIGA_ROLE ?? "viewer",
};

/** The logged-in actor, or null if there's no (valid) session cookie. */
export async function getSession(): Promise<Actor | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<Actor>;
    if (typeof p.factio === "string" && typeof p.role === "string") {
      return { factio: p.factio, role: p.role };
    }
  } catch {
    // malformed cookie → treated as no session
  }
  return null;
}

/** The actor to act as — the session, or the env default as a fallback. */
export async function getActor(): Promise<Actor> {
  return (await getSession()) ?? ENV_DEFAULT;
}

export async function setSession(actor: Actor): Promise<void> {
  (await cookies()).set(COOKIE, JSON.stringify(actor), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
