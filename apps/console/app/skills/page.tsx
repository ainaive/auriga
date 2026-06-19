import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const skills = await api.skills();

  return (
    <Card>
      <CardTitle>Skill marketplace</CardTitle>
      {!skills || skills.length === 0 ? (
        <p className="text-muted-foreground">No skills (set AURIGA_SKILLS on the API).</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>skill</TH>
              <TH>type</TH>
              <TH>version</TH>
              <TH>uses</TH>
              <TH>ok</TH>
              <TH>cost</TH>
              <TH>description</TH>
            </TR>
          </THead>
          <TBody>
            {skills.map((s) => (
              <TR key={`${s.name}@${s.version}`}>
                <TD className="font-medium">{s.name}</TD>
                <TD>
                  <Badge>{s.type}</Badge>
                </TD>
                <TD className="font-mono text-xs text-muted-foreground">{s.version}</TD>
                <TD className="tabular-nums">{s.stats.uses}</TD>
                <TD className="tabular-nums">{s.stats.successes}</TD>
                <TD className="tabular-nums">~${s.stats.total_cost_usd.toFixed(4)}</TD>
                <TD className="text-muted-foreground">{s.description}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
