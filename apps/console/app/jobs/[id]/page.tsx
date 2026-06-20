import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { ApproveButton } from "@/components/approve-button";
import { CancelButton } from "@/components/cancel-button";
import { LiveRun } from "@/components/live-run";
import { PauseButton } from "@/components/pause-button";
import { RunButton } from "@/components/run-button";
import { RunTimelinePanel } from "@/components/run-timeline-panel";
import { WorkspaceViewer } from "@/components/workspace-viewer";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { jobActions } from "@/lib/job-actions";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await api.job(id);
  if (!job) notFound();

  const a = jobActions(job);
  // "Live" states stream; resting states (paused/terminal) render the sealed trace.
  const live = a.active || job.state === "pending";
  // Only the resting branch uses the sealed trace — skip the fetch for live runs.
  const trace = live ? null : await api.trace(id);
  const ws = await api.workspace(id);
  const tokens = job.usage.input_tokens + job.usage.output_tokens;
  const hasActions = a.needsApproval || a.runnable || a.pausable || a.cancellable;

  return (
    <div className="space-y-5">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Jobs
      </Link>

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-sm font-semibold">{job.id}</h1>
          <Badge tone={job.state} dot>
            {job.state}
          </Badge>
          {job.reason && <span className="text-sm text-muted-foreground">{job.reason}</span>}
        </div>
        <p className="mt-3 text-base leading-relaxed">{job.spec.goal}</p>
        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          <Meta label="model" value={job.model ?? "—"} />
          <Meta label="attempts" value={job.attempts} />
          <Meta label="steps" value={job.steps} />
          <Meta label="tokens" value={tokens.toLocaleString()} />
        </dl>
        {hasActions && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
            {a.needsApproval && <ApproveButton id={job.id} />}
            {a.runnable && <RunButton id={job.id} label={a.resumable ? "Resume" : "Run"} />}
            {a.pausable && <PauseButton id={job.id} />}
            {a.cancellable && <CancelButton id={job.id} />}
          </div>
        )}
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
          <RunTimelinePanel events={trace?.events ?? []} />
        )}
      </Card>

      {ws && ws.files.length > 0 && (
        <Card>
          <CardTitle>Workspace</CardTitle>
          <WorkspaceViewer jobId={job.id} files={ws.files} />
        </Card>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[0.65rem] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium tabular-nums">{value}</dd>
    </div>
  );
}
