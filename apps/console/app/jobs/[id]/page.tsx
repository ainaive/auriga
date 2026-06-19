import { notFound } from "next/navigation";
import { api } from "@/lib/api";
import { ApproveButton } from "@/components/approve-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await api.job(id);
  if (!job) notFound();
  const trace = await api.trace(id);

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
        {job.state === "paused" && <ApproveButton id={job.id} />}
      </Card>

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
