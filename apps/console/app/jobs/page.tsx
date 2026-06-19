import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const jobs = await api.jobs();
  if (!jobs) return <p className="text-neutral-500">API unavailable or unauthorized.</p>;

  return (
    <main>
      <Card>
        <CardTitle>Jobs</CardTitle>
        {jobs.length === 0 ? (
          <p className="text-neutral-500">No jobs.</p>
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
                      className="text-blue-700 hover:underline"
                      href={`/jobs/${encodeURIComponent(j.id)}`}
                    >
                      {j.id}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={j.state}>{j.state}</Badge>
                  </TD>
                  <TD>{j.spec.goal}</TD>
                  <TD>{j.steps}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </main>
  );
}
