import { api } from "@/lib/api";
import { Card, CardTitle } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const skills = await api.skills();

  return (
    <main>
      <Card>
        <CardTitle>Skill marketplace</CardTitle>
        {!skills || skills.length === 0 ? (
          <p className="text-neutral-500">No skills (set AURIGA_SKILLS on the API).</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>skill</TH>
                <TH>version</TH>
                <TH>uses</TH>
                <TH>ok</TH>
                <TH>description</TH>
              </TR>
            </THead>
            <TBody>
              {skills.map((s) => (
                <TR key={s.name}>
                  <TD>{s.name}</TD>
                  <TD>{s.version}</TD>
                  <TD>{s.stats.uses}</TD>
                  <TD>{s.stats.successes}</TD>
                  <TD>{s.description}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </main>
  );
}
