import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { ApproveButton } from "@/components/approve-button";
import { CancelButton } from "@/components/cancel-button";
import { JobProgress } from "@/components/job-progress";
import { RunButton } from "@/components/run-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await api.job(id);
  if (!job) notFound();
  const trace = await api.trace(id);

  const active = ["planning", "running", "verifying"].includes(job.state);
  const terminal = ["done", "failed", "cancelled"].includes(job.state);
  const needsApproval = job.state === "paused" && !job.approved;
  // Runnable: not currently active, not done, and not waiting on approval (failed/cancelled re-run ok).
  const runnable = !active && job.state !== "done" && !needsApproval;
  const cancellable = !terminal; // pending / planning / running / verifying / paused

  return (
    <main className="space-y-6">
      <Card>
        <CardTitle>{job.id}</CardTitle>
        <div className="flex items-center gap-3">
          <Badge tone={job.state}>{job.state}</Badge>
          <span className="text-sm text-neutral-600">{job.reason}</span>
        </div>
        <p className="mt-2 text-sm">{job.spec.goal}</p>
        <p className="mt-2 text-xs text-neutral-500">
          model {job.model ?? "—"} · attempts {job.attempts} · steps {job.steps} · tokens{" "}
          {job.usage.input_tokens}/{job.usage.output_tokens}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {needsApproval && <ApproveButton id={job.id} />}
          {runnable && <RunButton id={job.id} />}
          {cancellable && <CancelButton id={job.id} />}
          {active && <span className="text-sm text-neutral-500">Running… (auto-refreshing)</span>}
        </div>
      </Card>
      <JobProgress state={job.state} />

      <Card>
        <CardTitle>Trace</CardTitle>
        {!trace ? (
          <p className="text-neutral-500">No trace recorded.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {trace.events.map((e, i) => (
              <li key={i} className="font-mono text-xs text-neutral-700">
                {e.type}
              </li>
            ))}
          </ol>
        )}
      </Card>
    </main>
  );
}
