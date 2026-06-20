import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await api.jobs();
  if (!jobs) return <p className="text-muted-foreground">API unavailable or unauthorized.</p>;

  return (
    <Card>
      <CardTitle>Jobs</CardTitle>
      {jobs.length === 0 ? (
        <p className="text-muted-foreground">No jobs yet.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>id</TH>
              <TH>state</TH>
              <TH>goal</TH>
              <TH>steps</TH>
            </TR>
          </THead>
          <TBody>
            {jobs.map((j) => (
              <TR key={j.id}>
                <TD>
                  <Link
                    className="font-mono text-xs text-foreground hover:underline"
                    href={`/jobs/${encodeURIComponent(j.id)}`}
                  >
                    {j.id}
                  </Link>
                </TD>
                <TD>
                  <Badge tone={j.state} dot>
                    {j.state}
                  </Badge>
                </TD>
                <TD className="text-muted-foreground">{j.spec.goal}</TD>
                <TD className="tabular-nums">{j.steps}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
