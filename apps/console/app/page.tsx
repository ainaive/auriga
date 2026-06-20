import Link from "next/link";
import { api } from "@/lib/api";
import { Sparkline } from "@/components/sparkline";
import { Badge } from "@/components/ui/badge";
import { Bar } from "@/components/ui/bar";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dash = await api.dashboard();
  if (!dash) return <p className="text-muted-foreground">API unavailable.</p>;

  const totalActive = dash.active.reduce((sum, a) => sum + a.active, 0);
  const maxModelCost = Math.max(...dash.byModel.map((m) => m.cost_usd), 0.0001);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Jobs" value={dash.totals.jobs.toLocaleString()} />
        <Stat label="Tenants" value={dash.totals.tenants.toLocaleString()} />
        <Stat label="Cost" value={`~$${dash.totals.cost_usd.toFixed(4)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardTitle>Cost trend</CardTitle>
          <Sparkline values={dash.costTrend.map((p) => p.cost_usd)} ariaLabel="daily cost trend" />
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {dash.costTrend.length > 0
              ? `${dash.costTrend[0]?.bucket} → ${dash.costTrend.at(-1)?.bucket}`
              : "no data"}{" "}
            · ~${dash.totals.cost_usd.toFixed(4)} total
          </p>
        </Card>

        <Card>
          <CardTitle>Cost by model</CardTitle>
          {dash.byModel.length === 0 ? (
            <p className="text-sm text-muted-foreground">no data</p>
          ) : (
            <div className="space-y-2">
              {dash.byModel.slice(0, 6).map((m) => (
                <Bar
                  key={m.model}
                  label={m.model}
                  value={m.cost_usd}
                  max={maxModelCost}
                  valueLabel={`~$${m.cost_usd.toFixed(4)}`}
                />
              ))}
            </div>
          )}
        </Card>

        {dash.quotas && (
          <Card>
            <CardTitle>Quota utilization</CardTitle>
            <div className="space-y-2">
              <Bar
                label="global · active"
                value={totalActive}
                max={dash.quotas.global}
                valueLabel={`${totalActive} / ${dash.quotas.global}`}
                warn={totalActive / dash.quotas.global >= 0.8}
              />
              {dash.active.map((a) => (
                <Bar
                  key={a.factio}
                  label={a.factio}
                  value={a.active}
                  max={dash.quotas?.perFactio ?? 1}
                  valueLabel={`${a.active} / ${dash.quotas?.perFactio}`}
                  warn={a.active / (dash.quotas?.perFactio ?? 1) >= 0.8}
                />
              ))}
              {dash.active.length === 0 && (
                <p className="text-xs text-muted-foreground">no active jobs</p>
              )}
            </div>
          </Card>
        )}
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
