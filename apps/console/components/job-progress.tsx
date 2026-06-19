"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const ACTIVE = ["planning", "running", "verifying"];

/**
 * While a job is actively running, refresh the (server-rendered) page every 2s so the
 * user watches it progress without a manual reload. No-op once the state is terminal/paused.
 */
export function JobProgress({ state }: { state: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!ACTIVE.includes(state)) return;
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [state, router]);
  return null;
}
