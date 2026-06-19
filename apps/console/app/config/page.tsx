import { api } from "@/lib/api";
import { ConfigForm } from "@/components/config-form";
import { Card, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const config = await api.config();
  if (!config) {
    return <p className="text-neutral-500">Config unavailable (the API has no config store).</p>;
  }
  return (
    <main>
      <Card>
        <CardTitle>Configuration</CardTitle>
        <ConfigForm initial={JSON.stringify(config, null, 2)} />
      </Card>
    </main>
  );
}
