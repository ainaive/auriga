import { api } from "@/lib/api";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dash = await api.dashboard();
  if (!dash) return <p className="text-neutral-500">API unavailable.</p>;

  return (
    <main className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardTitle>Jobs</CardTitle>
          <p className="text-2xl font-semibold">{dash.totals.jobs}</p>
        </Card>
        <Card>
          <CardTitle>Tenants</CardTitle>
          <p className="text-2xl font-semibold">{dash.totals.tenants}</p>
        </Card>
        <Card>
          <CardTitle>Cost</CardTitle>
          <p className="text-2xl font-semibold">~${dash.totals.cost_usd.toFixed(4)}</p>
        </Card>
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
                <TD>{t.factio}</TD>
                <TD>{t.total}</TD>
                <TD>
                  {Object.entries(t.byState)
                    .map(([k, v]) => `${k}:${v}`)
                    .join(" ")}
                </TD>
                <TD>~${t.cost_usd.toFixed(4)}</TD>
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
              <TH>ts</TH>
              <TH>factio</TH>
              <TH>action</TH>
              <TH>job</TH>
            </TR>
          </THead>
          <TBody>
            {dash.recentAudit.map((e) => (
              <TR key={e.id}>
                <TD>{e.ts}</TD>
                <TD>{e.factio}</TD>
                <TD>{e.action}</TD>
                <TD>{e.job_id ?? ""}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </main>
  );
}
