import {
  Bot,
  CheckCircle2,
  Scissors,
  Puzzle,
  Wrench,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ContentBlock, TraceEvent } from "@/lib/types";

const MAX_OUTPUT = 1600;

function textOf(content: ContentBlock[]): string {
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function toolUsesOf(content: ContentBlock[]): string[] {
  return content.filter((b) => b.type === "tool_use" && b.name).map((b) => b.name as string);
}

function truncate(s: string, max = MAX_OUTPUT): string {
  return s.length > max ? `${s.slice(0, max)}\n… (${s.length - max} more chars)` : s;
}

interface Row {
  icon: LucideIcon;
  tone: string;
  title: string;
  meta?: string;
  body?: ReactNode;
}

const MONO = "mt-1 max-h-40 overflow-auto rounded-lg border border-border/60 bg-muted/50 p-2.5 font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words";

function rowFor(e: TraceEvent): Row {
  switch (e.type) {
    case "model_response": {
      const text = textOf(e.response.content);
      const tools = toolUsesOf(e.response.content);
      return {
        icon: Bot,
        tone: "bg-muted text-foreground ring-border",
        title: "Model",
        meta: `step ${e.step}`,
        body: (
          <>
            {text && (
              <p className="mt-0.5 line-clamp-6 whitespace-pre-wrap text-sm text-muted-foreground">
                {text}
              </p>
            )}
            {tools.length > 0 && (
              <p className="mt-0.5 font-mono text-xs text-muted-foreground">→ {tools.join(", ")}</p>
            )}
          </>
        ),
      };
    }
    case "tool_call":
      return {
        icon: Wrench,
        tone: e.isError
          ? "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/25"
          : "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/25",
        title: e.tool,
        meta: `step ${e.step}${e.isError ? " · error" : ""}`,
        body: e.output ? <pre className={MONO}>{truncate(e.output)}</pre> : undefined,
      };
    case "skill_loaded":
      return {
        icon: Puzzle,
        tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-indigo-500/25",
        title: `Loaded skill ${e.skill.name}`,
        meta: `v${e.skill.version}`,
      };
    case "compaction":
      return {
        icon: Scissors,
        tone: "bg-muted text-muted-foreground ring-border",
        title: "Context compacted",
        meta: `${e.dropped} messages offloaded`,
      };
    case "verify": {
      const failed = e.criteria.filter((c) => !c.passed);
      return {
        icon: e.passed ? CheckCircle2 : XCircle,
        tone: e.passed
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/25"
          : "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/25",
        title: `Verify · attempt ${e.attempt}`,
        meta: e.passed ? "passed" : "failed",
        body:
          failed.length > 0 ? (
            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
              {failed.map((c, i) => (
                <li key={i} className="font-mono">
                  ✗ {c.kind}: {truncate(c.evidence, 240)}
                </li>
              ))}
            </ul>
          ) : undefined,
      };
    }
  }
}

/** Renders an ordered trace as a dense step timeline. Shared by the live view and the
 *  sealed-trace viewer. An optional `filter` narrows the events (e.g. tool output only). */
export function RunTimeline({
  events,
  className,
  filter,
}: {
  events: TraceEvent[];
  className?: string;
  filter?: (e: TraceEvent) => boolean;
}) {
  const shown = filter ? events.filter(filter) : events;
  if (shown.length === 0) {
    return <p className="text-sm text-muted-foreground">No steps yet.</p>;
  }
  return (
    <ol className={cn("relative space-y-4", className)}>
      {/* A subtle rail connecting the step nodes (left edge, behind the icons). */}
      <div aria-hidden="true" className="absolute bottom-2 left-3 top-2 w-px bg-border/70" />
      {shown.map((e, i) => {
        const r = rowFor(e);
        const Icon = r.icon;
        return (
          <li key={i} className="relative flex gap-3">
            <div
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
                r.tone,
              )}
            >
              <Icon className="size-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{r.title}</span>
                {r.meta && <span className="text-xs text-muted-foreground">{r.meta}</span>}
              </div>
              {r.body}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
