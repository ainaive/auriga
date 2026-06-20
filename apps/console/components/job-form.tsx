"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field, Label } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createJob } from "@/lib/actions";
import {
  buildJobSpec,
  defaultJobForm,
  emptyCriterion,
  type CriterionDraft,
  type JobFormState,
} from "@/lib/job-form";

export function JobForm({ factio, createdBy }: { factio: string; createdBy: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"form" | "json">("form");
  const [form, setForm] = useState<JobFormState>(() => ({
    ...defaultJobForm(),
    id: `job_${Math.random().toString(36).slice(2, 10)}`,
  }));
  const [json, setJson] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = <K extends keyof JobFormState>(key: K, value: JobFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setCriterion = (i: number, c: CriterionDraft) =>
    setForm((f) => ({ ...f, criteria: f.criteria.map((x, j) => (j === i ? c : x)) }));
  const addCriterion = () =>
    setForm((f) => ({ ...f, criteria: [...f.criteria, emptyCriterion("command")] }));
  const removeCriterion = (i: number) =>
    setForm((f) => ({ ...f, criteria: f.criteria.filter((_, j) => j !== i) }));

  function submit(specJson: string) {
    setSubmitError(null);
    startTransition(async () => {
      const res = await createJob(specJson);
      if (res.ok) router.push(`/jobs/${res.id}`);
      else setSubmitError(res.error);
    });
  }

  function onSubmitForm() {
    const { spec, errors: errs } = buildJobSpec(form, { factio, created_by: createdBy });
    setErrors(errs);
    if (!spec) return;
    submit(JSON.stringify(spec));
  }

  // Switching to the JSON tab fills it from the current form (a live "view as JSON"),
  // so the structured edits aren't silently lost when you switch tabs.
  function switchMode(next: "form" | "json") {
    if (next === "json") {
      const { spec } = buildJobSpec(form, { factio, created_by: createdBy });
      if (spec) setJson(JSON.stringify(spec, null, 2));
    }
    setMode(next);
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="job spec input mode" className="flex gap-1 text-sm">
        <ModeTab active={mode === "form"} onClick={() => switchMode("form")}>
          Form
        </ModeTab>
        <ModeTab active={mode === "json"} onClick={() => switchMode("json")}>
          Raw JSON
        </ModeTab>
      </div>

      {mode === "json" ? (
        <div className="space-y-3">
          <Textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            placeholder="Paste a JobSpec as JSON…"
            spellCheck={false}
            className="h-80 font-mono text-xs"
          />
          <Button onClick={() => submit(json)} disabled={pending || !json.trim()}>
            {pending ? "Creating…" : "Create job"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job id" htmlFor="id" error={errors.id}>
              <Input id="id" value={form.id} onChange={(e) => set("id", e.target.value)} />
            </Field>
            <Field label="Tenant · author" hint="from your session">
              <Input value={`${factio} · ${createdBy}`} disabled />
            </Field>
          </div>

          <Field label="Goal" htmlFor="goal" error={errors.goal}>
            <Textarea
              id="goal"
              value={form.goal}
              onChange={(e) => set("goal", e.target.value)}
              placeholder="Fix the bug in src/add.ts so the test suite passes."
              className="h-20"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[8rem_1fr_8rem]">
            <Field label="Workspace" htmlFor="wskind">
              <Select
                id="wskind"
                value={form.workspaceKind}
                onChange={(e) => set("workspaceKind", e.target.value as "git" | "dir")}
              >
                <option value="dir">dir</option>
                <option value="git">git</option>
              </Select>
            </Field>
            <Field label="Path / URL" htmlFor="wspath" error={errors.workspacePath}>
              <Input
                id="wspath"
                value={form.workspacePath}
                onChange={(e) => set("workspacePath", e.target.value)}
              />
            </Field>
            <Field label="Ref" htmlFor="wsref" hint="optional">
              <Input
                id="wsref"
                value={form.workspaceRef}
                onChange={(e) => set("workspaceRef", e.target.value)}
              />
            </Field>
          </div>

          <Field
            label="Allowed tools"
            htmlFor="tools"
            error={errors.allowedTools}
            hint="comma-separated; enforced in the dispatcher, not the prompt"
          >
            <Input
              id="tools"
              value={form.allowedTools}
              onChange={(e) => set("allowedTools", e.target.value)}
            />
          </Field>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Acceptance criteria</Label>
              <Button type="button" variant="ghost" size="sm" onClick={addCriterion}>
                <Plus /> Add
              </Button>
            </div>
            {errors.criteria && <p className="text-xs text-destructive">{errors.criteria}</p>}
            <div className="space-y-2">
              {form.criteria.map((c, i) => (
                <CriterionRow
                  // biome-ignore lint/suspicious/noArrayIndexKey: criteria are positional drafts
                  key={i}
                  criterion={c}
                  error={errors[`criteria.${i}`]}
                  onChange={(next) => setCriterion(i, next)}
                  onRemove={form.criteria.length > 1 ? () => removeCriterion(i) : undefined}
                />
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="Max tokens" htmlFor="bt" error={errors.maxTokens}>
              <Input id="bt" value={form.maxTokens} onChange={(e) => set("maxTokens", e.target.value)} />
            </Field>
            <Field label="Max wall (s)" htmlFor="bw" error={errors.maxWallTimeS}>
              <Input id="bw" value={form.maxWallTimeS} onChange={(e) => set("maxWallTimeS", e.target.value)} />
            </Field>
            <Field label="Max cost ($)" htmlFor="bc" error={errors.maxCostUsd}>
              <Input id="bc" value={form.maxCostUsd} onChange={(e) => set("maxCostUsd", e.target.value)} />
            </Field>
            <Field label="Max steps" htmlFor="bs" error={errors.maxSteps}>
              <Input id="bs" value={form.maxSteps} onChange={(e) => set("maxSteps", e.target.value)} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.requireApproval}
              onChange={(e) => set("requireApproval", e.target.checked)}
              className="size-4 rounded border-input"
            />
            Require human approval before running (HITL)
          </label>

          <details className="rounded-md border bg-muted/30 p-3">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Advanced (skills, files, links, dependencies)
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Allowed skills" htmlFor="askills" hint="comma-separated">
                <Input id="askills" value={form.allowedSkills} onChange={(e) => set("allowedSkills", e.target.value)} />
              </Field>
              <Field label="Required skills" htmlFor="rskills" hint="always mounted">
                <Input id="rskills" value={form.requiredSkills} onChange={(e) => set("requiredSkills", e.target.value)} />
              </Field>
              <Field label="Context files" htmlFor="files" hint="comma-separated paths">
                <Input id="files" value={form.files} onChange={(e) => set("files", e.target.value)} />
              </Field>
              <Field label="Links" htmlFor="links" hint="comma-separated URLs">
                <Input id="links" value={form.links} onChange={(e) => set("links", e.target.value)} />
              </Field>
              <Field label="Depends on" htmlFor="deps" hint="job ids (DAG)">
                <Input id="deps" value={form.dependsOn} onChange={(e) => set("dependsOn", e.target.value)} />
              </Field>
            </div>
          </details>

          <Button onClick={onSubmitForm} disabled={pending}>
            {pending ? "Creating…" : "Create job"}
          </Button>
        </div>
      )}

      {submitError && <p className="text-sm text-destructive">{submitError}</p>}
      <p className="text-xs text-muted-foreground">
        Creates a <span className="font-medium">pending</span> job. Open it to run and watch it live.
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
          ? "rounded-md bg-secondary px-2.5 py-1 font-medium text-secondary-foreground"
          : "rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground"
      }
    >
      {children}
    </button>
  );
}

function CriterionRow({
  criterion,
  error,
  onChange,
  onRemove,
}: {
  criterion: CriterionDraft;
  error?: string;
  onChange: (c: CriterionDraft) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="rounded-md border bg-background p-2">
      <div className="flex items-center gap-2">
        <Select
          aria-label="criterion type"
          value={criterion.kind}
          onChange={(e) => onChange(emptyCriterion(e.target.value as CriterionDraft["kind"]))}
          className="h-8 w-36"
        >
          <option value="command">command</option>
          <option value="file_exists">file_exists</option>
          <option value="named_check">named_check</option>
        </Select>

        {criterion.kind === "command" && (
          <>
            <Input
              aria-label="command"
              value={criterion.cmd}
              placeholder="bun test"
              onChange={(e) => onChange({ ...criterion, cmd: e.target.value })}
            />
            <Input
              value={criterion.expectExit}
              aria-label="expected exit code"
              className="w-20"
              onChange={(e) => onChange({ ...criterion, expectExit: e.target.value })}
            />
          </>
        )}
        {criterion.kind === "file_exists" && (
          <Input
            aria-label="file path"
            value={criterion.path}
            placeholder="path/to/file"
            onChange={(e) => onChange({ ...criterion, path: e.target.value })}
          />
        )}
        {criterion.kind === "named_check" && (
          <Input
            aria-label="check name"
            value={criterion.name}
            placeholder="check name"
            onChange={(e) => onChange({ ...criterion, name: e.target.value })}
          />
        )}

        {onRemove && (
          <Button type="button" variant="ghost" size="icon" aria-label="remove criterion" onClick={onRemove}>
            <Trash2 />
          </Button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
