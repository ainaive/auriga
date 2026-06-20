import Link from "next/link";
import { api } from "@/lib/api";
import { JobRowActions } from "@/components/job-row-actions";
import { JobsFilterBar } from "@/components/jobs-filter-bar";
import { JobsPager } from "@/components/jobs-pager";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

const LIMIT = 25;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const offset = Math.max(0, Number(str("offset") ?? 0) || 0);
  const after = str("after");
  const before = str("before");

  const page = await api.jobs({
    state: str("state"),
    q: str("q"),
    // date inputs are day-granular; widen to cover the whole selected day (UTC).
    created_after: after ? `${after}T00:00:00.000Z` : undefined,
    created_before: before ? `${before}T23:59:59.999Z` : undefined,
    limit: LIMIT,
    offset,
  });

  if (!page) return <p className="text-muted-foreground">API unavailable or unauthorized.</p>;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="mb-0">Jobs</CardTitle>
        <JobsFilterBar />
      </div>

      {page.jobs.length === 0 ? (
        <p className="text-muted-foreground">No jobs match.</p>
      ) : (
        <>
          <Table>
            <THead>
              <TR>
                <TH>id</TH>
                <TH>state</TH>
                <TH>goal</TH>
                <TH>steps</TH>
                <TH>actions</TH>
              </TR>
            </THead>
            <TBody>
              {page.jobs.map((j) => (
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
                  <TD>
                    <JobRowActions job={j} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          <div className="mt-3">
            <JobsPager total={page.total} limit={page.limit} offset={page.offset} />
          </div>
        </>
      )}
    </Card>
  );
}
