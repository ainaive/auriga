import { Card, CardTitle } from "@/components/ui/card";
import { NewJobForm } from "@/components/new-job-form";

export default function NewJobPage() {
  return (
    <main>
      <Card>
        <CardTitle>New job</CardTitle>
        <NewJobForm />
      </Card>
    </main>
  );
}
