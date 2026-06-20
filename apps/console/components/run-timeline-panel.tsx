"use client";

import { useState } from "react";
import { RunTimeline } from "@/components/run-timeline";
import type { TraceEvent } from "@/lib/types";

const TABS = [
  { key: "steps", label: "Steps", filter: undefined },
  { key: "logs", label: "Logs", filter: (e: TraceEvent) => e.type === "tool_call" },
] as const;

/** The run timeline with a Steps / Logs view toggle (Logs = tool output only). */
export function RunTimelinePanel({ events }: { events: TraceEvent[] }) {
  const [tab, setTab] = useState<"steps" | "logs">("steps");
  const active = TABS.find((t) => t.key === tab) ?? TABS[0];

  return (
    <div className="space-y-2">
      <div role="tablist" aria-label="timeline view" className="flex gap-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? "rounded-md bg-secondary px-2.5 py-1 font-medium text-secondary-foreground"
                : "rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground"
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <RunTimeline events={events} filter={active.filter} />
    </div>
  );
}
