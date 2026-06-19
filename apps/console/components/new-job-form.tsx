"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createJob } from "@/lib/actions";
import { Button } from "@/components/ui/button";

// A runnable starting point (the repo's fixtures/failing-test bug-fix job).
const EXAMPLE = JSON.stringify(
  {
    id: "job_fix_add",
    factio: "default",
    created_by: "console@example.com",
    goal: "Fix the bug in src/add.ts so the test suite passes.",
    context_refs: { workspace: { kind: "dir", url_or_path: "./fixtures/failing-test" } },
    allowed_tools: ["read_file", "write_file", "bash", "git", "search"],
    acceptance_criteria: [{ kind: "command", cmd: "bun test", expect_exit: 0 }],
    budget: { max_tokens: 200000, max_wall_time_s: 600, max_cost_usd: 5, max_steps: 30 },
  },
  null,
  2,
);

export function NewJobForm() {
  const router = useRouter();
  const [spec, setSpec] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createJob(spec);
      if (res.ok) router.push(`/jobs/${res.id}`);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={spec}
        onChange={(e) => setSpec(e.target.value)}
        placeholder="Paste a JobSpec as JSON…"
        spellCheck={false}
        className="h-80 w-full rounded-lg border border-neutral-300 bg-white p-3 font-mono text-xs"
      />
      <div className="flex items-center gap-3">
        <Button onClick={onCreate} disabled={pending || !spec.trim()}>
          {pending ? "Creating…" : "Create job"}
        </Button>
        <Button variant="secondary" onClick={() => setSpec(EXAMPLE)} disabled={pending}>
          Load example
        </Button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
      <p className="text-xs text-neutral-500">
        Creates a <span className="font-medium">pending</span> job. Run it from the CLI (
        <code>auriga run &lt;id&gt;</code>) — the console doesn&apos;t execute jobs.
      </p>
    </div>
  );
}
