"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runJob } from "@/lib/actions";
import { Button } from "@/components/ui/button";

/** Kick a runnable job to execute (in-process, dev-grade). See the job-detail page for when it shows. */
export function RunButton({ id }: { id: string }) {
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
    <div className="mt-3 flex items-center gap-3">
      <Button onClick={onRun} disabled={pending}>
        {pending ? "Starting…" : "Run"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
