"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { pauseJob } from "@/lib/actions";
import { Button } from "@/components/ui/button";

/** Request a resumable pause of an active run. Shown only while the job is active. */
export function PauseButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPause() {
    setError(null);
    startTransition(async () => {
      const res = await pauseJob(id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={onPause} disabled={pending}>
        {pending ? "Pausing…" : "Pause"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </>
  );
}
