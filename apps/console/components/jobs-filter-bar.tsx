"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { JobState } from "@/lib/types";

const STATES: JobState[] = [
  "pending",
  "planning",
  "running",
  "verifying",
  "done",
  "failed",
  "paused",
  "cancelled",
];

/** Filter/search the jobs list. State lives in the URL (shareable; the server re-renders). */
export function JobsFilterBar() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [state, setState] = useState(params.get("state") ?? "");
  const [after, setAfter] = useState(params.get("after") ?? "");
  const [before, setBefore] = useState(params.get("before") ?? "");

  function apply() {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (state) next.set("state", state);
    if (after) next.set("after", after);
    if (before) next.set("before", before);
    router.push(`/jobs${next.toString() ? `?${next}` : ""}`); // reset to page 1
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <Input
        aria-label="search jobs by id or goal"
        placeholder="search id / goal…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-48"
      />
      <Select
        aria-label="filter by state"
        value={state}
        onChange={(e) => setState(e.target.value)}
        className="w-32"
      >
        <option value="">any state</option>
        {STATES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Input
        type="date"
        aria-label="created after"
        value={after}
        onChange={(e) => setAfter(e.target.value)}
        className="w-36"
      />
      <Input
        type="date"
        aria-label="created before"
        value={before}
        onChange={(e) => setBefore(e.target.value)}
        className="w-36"
      />
      <Button type="submit">Filter</Button>
      <Button type="button" variant="ghost" onClick={() => router.push("/jobs")}>
        Clear
      </Button>
    </form>
  );
}
