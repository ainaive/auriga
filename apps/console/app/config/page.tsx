import { api } from "@/lib/api";
import { ConfigForm } from "@/components/config-form";
import { Card, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const config = await api.config();
  if (!config) {
    return <p className="text-muted-foreground">Config unavailable (the API has no config store).</p>;
  }
  return (
    <div className="mx-auto max-w-3xl">
      <Card>
        <CardTitle>Configuration</CardTitle>
        <ConfigForm initial={config} />
      </Card>
    </div>
  );
}
