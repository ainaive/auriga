import { api } from "@/lib/api";
import { ConfigForm } from "@/components/config-form";
import { Card, CardTitle } from "@/components/ui/card";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const [config, actor] = await Promise.all([api.config(), getActor()]);
  if (!config) {
    return <p className="text-muted-foreground">Config unavailable (the API has no config store).</p>;
  }
  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardTitle>Configuration</CardTitle>
        <ConfigForm initial={config} canEdit={actor.role === "admin"} />
      </Card>
    </div>
  );
}
