"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveConfig } from "@/lib/actions";
import { Button } from "@/components/ui/button";

/** Edit the control-plane config (policies + quotas) as JSON. Save needs an admin session. */
export function ConfigForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveConfig(text);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        className="h-96 w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-xs"
      />
      <div className="flex items-center gap-3">
        <Button onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save config"}
        </Button>
        {saved && <span className="text-sm text-green-700">Saved.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
      <p className="text-xs text-neutral-500">
        Editing RBAC + quotas. Saving requires an <span className="font-medium">admin</span> session.
      </p>
    </div>
  );
}
