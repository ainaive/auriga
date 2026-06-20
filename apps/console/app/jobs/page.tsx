import { CloudOff, Inbox } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { JobRowActions } from "@/components/job-row-actions";
import { JobsFilterBar } from "@/components/jobs-filter-bar";
import { JobsPager } from "@/components/jobs-pager";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
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

  if (!page) {
    return (
      <EmptyState
        icon={CloudOff}
        title="Unavailable"
        description="The API could not be reached, or you're not authorized to view jobs."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Jobs</h1>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {page.total.toLocaleString()} total
          </p>
        </div>
        <JobsFilterBar />
      </div>

      {page.jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={Inbox}
            title="No jobs match"
            description="Try clearing the filters, or create a new job to get started."
          />
        </Card>
      ) : (
        <Card>
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
                      className="font-mono text-xs text-foreground transition-colors hover:text-foreground/70 hover:underline"
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
          <div className="mt-4">
            <JobsPager total={page.total} limit={page.limit} offset={page.offset} />
          </div>
        </Card>
      )}
    </div>
  );
}
