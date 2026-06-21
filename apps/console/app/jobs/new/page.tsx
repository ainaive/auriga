import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { JobForm } from "@/components/job-form";
import { Card } from "@/components/ui/card";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const actor = await getActor();
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/jobs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Jobs
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">New job</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Define a job spec and submit it as pending.
        </p>
      </div>
      <Card>
        <JobForm factio={actor.factio} createdBy={`${actor.role}@${actor.factio}`} />
      </Card>
    </div>
  );
}
