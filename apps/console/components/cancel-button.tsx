"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelJob } from "@/lib/actions";
import { Button } from "@/components/ui/button";

/** Request cancellation of a non-terminal job (cooperative; see the job-detail page for when it shows). */
export function CancelButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onCancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelJob(id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={onCancel} disabled={pending}>
        {pending ? "Cancelling…" : "Cancel"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </>
  );
}
