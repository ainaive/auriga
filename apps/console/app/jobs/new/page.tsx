import { JobForm } from "@/components/job-form";
import { Card, CardTitle } from "@/components/ui/card";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function NewJobPage() {
  const actor = await getActor();
  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardTitle>New job</CardTitle>
        <JobForm factio={actor.factio} createdBy={`${actor.role}@${actor.factio}`} />
      </Card>
    </div>
  );
}
