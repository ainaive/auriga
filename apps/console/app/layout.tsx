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

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body className="mx-auto max-w-5xl bg-neutral-50 p-6 font-sans text-neutral-900">
        <header className="mb-6 flex items-baseline gap-4">
          <Link href="/" className="text-lg font-bold">
            Auriga
          </Link>
          <nav className="flex gap-3 text-sm text-neutral-600">
            <Link href="/">Dashboard</Link>
            <Link href="/jobs">Jobs</Link>
            <Link href="/skills">Skills</Link>
            <Link href="/config">Config</Link>
            <Link href="/jobs/new" className="font-medium text-neutral-900">
              + New job
            </Link>
          </nav>
          {session && (
            <span className="ml-auto flex items-baseline gap-3 text-sm text-neutral-500">
              <span>
                {session.factio} · {session.role}
              </span>
              <LogoutButton />
            </span>
          )}
        </header>
        {children}
      </body>
    </html>
  );
}
