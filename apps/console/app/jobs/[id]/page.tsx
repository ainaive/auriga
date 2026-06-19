import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { ApproveButton } from "@/components/approve-button";
import { CancelButton } from "@/components/cancel-button";
import { LiveRun } from "@/components/live-run";
import { PauseButton } from "@/components/pause-button";
import { RunButton } from "@/components/run-button";
import { RunTimeline } from "@/components/run-timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { ACTIVE_STATES, TERMINAL_STATES } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await api.job(id);
  if (!job) notFound();
  const trace = await api.trace(id);

  const active = ACTIVE_STATES.includes(job.state);
  const terminal = TERMINAL_STATES.includes(job.state);
  // "Live" states stream; resting states (paused/terminal) render the sealed trace.
  const live = active || job.state === "pending";
  const needsApproval = job.state === "paused" && !!job.spec.require_approval && !job.approved;
  const resumable = job.state === "paused" && !needsApproval;
  // Runnable: not active, not done, not awaiting approval (pending/failed/cancelled re-run; paused resume).
  const runnable = !active && job.state !== "done" && !needsApproval;
  const cancellable = !terminal;
  const tokens = job.usage.input_tokens + job.usage.output_tokens;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center gap-3">
          <h1 className="font-mono text-sm font-semibold">{job.id}</h1>
          <Badge tone={job.state} dot>
            {job.state}
          </Badge>
          {job.reason && <span className="text-sm text-muted-foreground">{job.reason}</span>}
        </div>
        <p className="mt-2 text-sm">{job.spec.goal}</p>
        <p className="mt-2 text-xs text-muted-foreground tabular-nums">
          model {job.model ?? "—"} · attempts {job.attempts} · steps {job.steps} · tokens{" "}
          {tokens.toLocaleString()}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {needsApproval && <ApproveButton id={job.id} />}
          {runnable && <RunButton id={job.id} label={resumable ? "Resume" : "Run"} />}
          {active && <PauseButton id={job.id} />}
          {cancellable && <CancelButton id={job.id} />}
        </div>
      </Card>

      <Card>
        <CardTitle>{live ? "Live run" : "Trace"}</CardTitle>
        {live ? (
          <LiveRun
            jobId={job.id}
            seed={{
              state: job.state,
              reason: job.reason,
              attempt: job.attempts,
              steps: job.steps,
              usage: job.usage,
            }}
          />
        ) : (
          <RunTimeline events={trace?.events ?? []} />
        )}
      </Card>
    </div>
  );
}
