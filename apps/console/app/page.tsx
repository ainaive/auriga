import Link from "next/link";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dash = await api.dashboard();
  if (!dash) return <p className="text-muted-foreground">API unavailable.</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Jobs" value={dash.totals.jobs.toLocaleString()} />
        <Stat label="Tenants" value={dash.totals.tenants.toLocaleString()} />
        <Stat label="Cost" value={`~$${dash.totals.cost_usd.toFixed(4)}`} />
      </div>

      <Card>
        <CardTitle>Tenants</CardTitle>
        <Table>
          <THead>
            <TR>
              <TH>factio</TH>
              <TH>jobs</TH>
              <TH>states</TH>
              <TH>cost</TH>
            </TR>
          </THead>
          <TBody>
            {dash.tenants.map((t) => (
              <TR key={t.factio}>
                <TD className="font-medium">{t.factio}</TD>
                <TD className="tabular-nums">{t.total}</TD>
                <TD>
                  <span className="flex flex-wrap gap-1">
                    {Object.entries(t.byState).map(([k, v]) => (
                      <Badge key={k} tone={k}>
                        {k} {v}
                      </Badge>
                    ))}
                  </span>
                </TD>
                <TD className="tabular-nums">~${t.cost_usd.toFixed(4)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardTitle>Recent audit</CardTitle>
        <Table>
          <THead>
            <TR>
              <TH>time</TH>
              <TH>factio</TH>
              <TH>action</TH>
              <TH>job</TH>
            </TR>
          </THead>
          <TBody>
            {dash.recentAudit.map((e) => (
              <TR key={e.id}>
                <TD className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                  {new Date(e.ts).toLocaleString()}
                </TD>
                <TD>{e.factio}</TD>
                <TD className="font-mono text-xs">{e.action}</TD>
                <TD className="font-mono text-xs">
                  {e.job_id ? (
                    <Link href={`/jobs/${e.job_id}`} className="text-foreground hover:underline">
                      {e.job_id}
                    </Link>
                  ) : (
                    ""
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardTitle>{label}</CardTitle>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}
