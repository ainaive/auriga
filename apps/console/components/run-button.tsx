"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runJob } from "@/lib/actions";
import { Button } from "@/components/ui/button";

/** Kick a runnable job to execute (in-process, dev-grade). `label` is "Resume" for a paused job. */
export function RunButton({ id, label = "Run" }: { id: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onRun() {
    setError(null);
    startTransition(async () => {
      const res = await runJob(id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <>
      <Button onClick={onRun} disabled={pending}>
        {pending ? "Starting…" : label}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </>
  );
}
