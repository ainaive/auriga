import { CloudOff } from "lucide-react";
import { api } from "@/lib/api";
import { ConfigForm } from "@/components/config-form";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  const [config, actor] = await Promise.all([api.config(), getActor()]);
  if (!config) {
    return (
      <EmptyState
        icon={CloudOff}
        title="Config unavailable"
        description="The API has no config store configured."
      />
    );
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">RBAC policies and scheduler quotas.</p>
      </div>
      <Card>
        <ConfigForm initial={config} canEdit={actor.role === "admin"} />
      </Card>
    </div>
  );
}
