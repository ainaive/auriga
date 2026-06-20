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
          {a.needsApproval && <ApproveButton id={job.id} />}
          {a.runnable && <RunButton id={job.id} label={a.resumable ? "Resume" : "Run"} />}
          {a.pausable && <PauseButton id={job.id} />}
          {a.cancellable && <CancelButton id={job.id} />}
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
