import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { getSession } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auriga · console",
  description: "Auriga control-plane console",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/jobs", label: "Jobs" },
  { href: "/skills", label: "Skills" },
  { href: "/config", label: "Config" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-6xl items-center gap-5 px-6">
            <Link href="/" className="text-sm font-bold tracking-tight">
              Auriga
            </Link>
            <nav className="flex items-center gap-4 text-sm text-muted-foreground">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="transition-colors hover:text-foreground">
                  {n.label}
                </Link>
              ))}
              <Link
                href="/jobs/new"
                className="font-medium text-foreground transition-colors hover:text-foreground/80"
              >
                + New job
              </Link>
            </nav>
            {session && (
              <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
                <span className="tabular-nums">
                  {session.factio} · {session.role}
                </span>
                <LogoutButton />
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
