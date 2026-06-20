"use client";

import { Radio } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useRef } from "react";
import { RunTimelinePanel } from "@/components/run-timeline-panel";
import { Badge } from "@/components/ui/badge";
import { initLiveRun, reduceLiveRun, type LiveRunSeed, type LiveRunState } from "@/lib/live-run";
import type { JobLiveEvent } from "@/lib/types";

/**
 * Watches a run live. Opens an EventSource to the same-origin SSE route (cookie
 * auth), folds the stream into a step timeline, and reconciles with the canonical
 * server record once terminal (a single router.refresh()). EventSource handles
 * reconnect + Last-Event-ID backfill for free.
 */
export function LiveRun({ jobId, seed }: { jobId: string; seed: LiveRunSeed }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reduceLiveRun, seed, initLiveRun);
  const refreshed = useRef(false);

  const reconcile = () => {
    if (refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  };

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/events`);
    es.onmessage = (ev) => {
      let data: JobLiveEvent;
      try {
        data = JSON.parse(ev.data) as JobLiveEvent;
      } catch {
        return;
      }
      dispatch(data);
      if (data.kind === "done") {
        es.close();
        reconcile();
      }
    };
    // EventSource auto-reconnects on error and resends Last-Event-ID; nothing to do.
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return (
    <div className="space-y-3">
      <LiveStatus state={state} />
      <RunTimelinePanel events={state.trace} />
    </div>
  );
}

function LiveStatus({ state }: { state: LiveRunState }) {
  const tokens = state.usage.input_tokens + state.usage.output_tokens;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm">
      <Badge tone={state.state} dot>
        {state.state}
      </Badge>
      <Stat label="attempt" value={state.attempt} />
      <Stat label="steps" value={state.steps} />
      <Stat label="tokens" value={tokens.toLocaleString()} />
      <Stat label="≈ cost" value={`$${state.cost_usd.toFixed(4)}`} />
      {!state.terminal && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Radio className="size-3.5 auriga-live-dot" />
          live
        </span>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="text-muted-foreground">
      {label} <span className="font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}
