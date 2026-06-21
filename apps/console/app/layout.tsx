import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "@/components/logout-button";
import { NavLinks } from "@/components/nav-links";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auriga · console",
  description: "Auriga control-plane console",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-background/70 backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid size-6 place-items-center rounded-md bg-primary text-[0.7rem] font-bold text-primary-foreground shadow-sm">
                A
              </span>
              <span className="text-sm">Auriga</span>
            </Link>
            <div className="mx-1 hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
            <NavLinks />
            <div className="ml-auto flex items-center gap-3">
              <Button asChild size="sm">
                <Link href="/jobs/new">+ New job</Link>
              </Button>
              {session && (
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <span className="hidden items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs shadow-sm sm:inline-flex">
                    <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span className="tabular-nums">
                      {session.factio} · {session.role}
                    </span>
                  </span>
                  <LogoutButton />
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
