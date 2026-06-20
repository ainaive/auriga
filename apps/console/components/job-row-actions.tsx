import { ApproveButton } from "@/components/approve-button";
import { CancelButton } from "@/components/cancel-button";
import { PauseButton } from "@/components/pause-button";
import { RunButton } from "@/components/run-button";
import type { Job } from "@/lib/api";
import { jobActions } from "@/lib/job-actions";

/** Inline lifecycle actions for a jobs-list row — same gating as the detail page. */
export function JobRowActions({ job }: { job: Job }) {
  const a = jobActions(job);
  return (
    <span className="flex flex-wrap gap-1.5">
      {a.needsApproval && <ApproveButton id={job.id} />}
      {a.runnable && <RunButton id={job.id} label={a.resumable ? "Resume" : "Run"} />}
      {a.pausable && <PauseButton id={job.id} />}
      {a.cancellable && <CancelButton id={job.id} />}
    </span>
  );
}
