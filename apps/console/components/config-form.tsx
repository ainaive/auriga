"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveConfig } from "@/lib/actions";
import type { AurigaConfig } from "@/lib/api";
import {
  buildConfig,
  configToForm,
  emptyPolicy,
  type ConfigFormState,
  type PolicyDraft,
} from "@/lib/config-form";

/** Edit RBAC policies + scheduler quotas. Read-only unless `canEdit` (admin); the API
 *  enforces admin on PUT /config regardless — this is defense-in-depth + UX. */
export function ConfigForm({ initial, canEdit = true }: { initial: AurigaConfig; canEdit?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"form" | "json">("form");
  const [form, setForm] = useState<ConfigFormState>(() => configToForm(initial));
  const [json, setJson] = useState(() => JSON.stringify(initial, null, 2));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-sync to the server config when it changes (after a successful save + refresh),
  // so the form reflects the persisted/normalized state. `initial` is stable during
  // client-side editing — the page only re-renders (new prop) on router.refresh.
  useEffect(() => {
    setForm(configToForm(initial));
    setJson(JSON.stringify(initial, null, 2));
  }, [initial]);

  const setPolicy = (i: number, p: PolicyDraft) =>
    setForm((f) => ({ ...f, policies: f.policies.map((x, j) => (j === i ? p : x)) }));
  const addPolicy = () => setForm((f) => ({ ...f, policies: [...f.policies, emptyPolicy()] }));
  const removePolicy = (i: number) =>
    setForm((f) => ({ ...f, policies: f.policies.filter((_, j) => j !== i) }));

  function save(payload: string) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await saveConfig(payload);
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function onSaveForm() {
    const { config, errors: errs } = buildConfig(form);
    setErrors(errs);
    if (!config) return;
    save(JSON.stringify(config));
  }

  // Switching to the JSON tab regenerates the JSON from the current form, so form
  // edits can't be silently lost (and then saved stale) when you switch tabs.
  function switchMode(next: "form" | "json") {
    if (next === "json") {
      const { config } = buildConfig(form);
      if (config) setJson(JSON.stringify(config, null, 2));
    }
    setMode(next);
  }

  return (
    <div className="space-y-4">
      <div
        role="tablist"
        aria-label="config input mode"
        className="inline-flex gap-1 rounded-lg bg-muted p-1 text-sm"
      >
        <ModeTab active={mode === "form"} onClick={() => switchMode("form")}>
          Form
        </ModeTab>
        <ModeTab active={mode === "json"} onClick={() => switchMode("json")}>
          Raw JSON
        </ModeTab>
      </div>

      <fieldset disabled={!canEdit} className="m-0 space-y-4 border-0 p-0">
      {mode === "json" ? (
        <div className="space-y-3">
          <Textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            spellCheck={false}
            className="h-96 font-mono text-xs"
          />
          {canEdit && (
            <Button onClick={() => save(json)} disabled={pending}>
              {pending ? "Saving…" : "Save config"}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <Label>Scheduler quotas</Label>
            <div className="mt-1 grid gap-4 sm:grid-cols-2">
              <Field label="Global concurrency" htmlFor="qg" error={errors.global}>
                <Input id="qg" value={form.global} onChange={(e) => setForm((f) => ({ ...f, global: e.target.value }))} />
              </Field>
              <Field label="Per-tenant concurrency" htmlFor="qf" error={errors.perFactio}>
                <Input id="qf" value={form.perFactio} onChange={(e) => setForm((f) => ({ ...f, perFactio: e.target.value }))} />
              </Field>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>RBAC policies (per factio)</Label>
              {canEdit && (
                <Button type="button" variant="ghost" size="sm" onClick={addPolicy}>
                  <Plus /> Add policy
                </Button>
              )}
            </div>
            {form.policies.length === 0 && (
              <p className="text-xs text-muted-foreground">No policies — add one to allow submissions.</p>
            )}
            <div className="space-y-3">
              {form.policies.map((p, i) => (
                <PolicyRow
                  // biome-ignore lint/suspicious/noArrayIndexKey: positional draft rows
                  key={i}
                  policy={p}
                  error={errors[`policy.${i}`]}
                  onChange={(next) => setPolicy(i, next)}
                  onRemove={() => removePolicy(i)}
                />
              ))}
            </div>
          </div>

          {canEdit && (
            <Button onClick={onSaveForm} disabled={pending}>
              {pending ? "Saving…" : "Save config"}
            </Button>
          )}
        </div>
      )}
      </fieldset>

      <div className="flex items-center gap-3">
        {saved && <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved.</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
      <p className="text-xs text-muted-foreground">
        {canEdit ? (
          <>
            Editing RBAC + quotas. Saving requires an{" "}
            <span className="font-medium">admin</span> session; edits take effect without a restart.
          </>
        ) : (
          "Read-only — an admin session is required to edit RBAC + quotas."
        )}
      </p>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        active
          ? "rounded-md bg-card px-2.5 py-1 font-medium text-foreground shadow-sm"
          : "rounded-md px-2.5 py-1 text-muted-foreground transition-colors hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

function PolicyRow({
  policy,
  error,
  onChange,
  onRemove,
}: {
  policy: PolicyDraft;
  error?: string;
  onChange: (p: PolicyDraft) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Factio" hint="tenant id">
          <Input value={policy.factio} onChange={(e) => onChange({ ...policy, factio: e.target.value })} />
        </Field>
        <Field label="Roles" hint="comma-separated; who may submit">
          <Input value={policy.roles} onChange={(e) => onChange({ ...policy, roles: e.target.value })} />
        </Field>
        <Field label="Allowed tools" hint="optional; narrows the spec's tools">
          <Input value={policy.allowedTools} onChange={(e) => onChange({ ...policy, allowedTools: e.target.value })} />
        </Field>
        <Field label="Allowed skills" hint="optional; narrows selectable skills">
          <Input value={policy.allowedSkills} onChange={(e) => onChange({ ...policy, allowedSkills: e.target.value })} />
        </Field>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button type="button" variant="ghost" size="sm" aria-label="remove policy" onClick={onRemove}>
          <Trash2 /> Remove
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}
