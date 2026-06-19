"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { approveJob } from "@/lib/actions";
import { Button } from "@/components/ui/button";

/** HITL approval control — only rendered for `paused` jobs (see the job-detail page). */
export function ApproveButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const res = await approveJob(id);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <>
      <Button onClick={onApprove} disabled={pending}>
        {pending ? "Approving…" : "Approve"}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </>
  );
}
