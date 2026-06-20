import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { JobState } from "@/lib/types";

// Semantic colors for the eight job-lifecycle states. Translucent fills + an inset
// ring read calmly on both light and dark; `dark:` keys on prefers-color-scheme to
// match the token theme.
const TONE: Record<string, string> = {
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/25",
  failed: "bg-red-500/15 text-red-700 dark:text-red-400 ring-red-500/25",
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-400 ring-blue-500/25",
  planning: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 ring-indigo-500/25",
  verifying: "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/25",
  paused: "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-amber-500/25",
  pending: "bg-muted text-muted-foreground ring-border",
  cancelled: "bg-muted text-muted-foreground ring-border",
};

/** States that represent an in-flight run (used to animate the status dot). */
export const ACTIVE_STATES: JobState[] = ["planning", "running", "verifying"];

export function Badge({
  children,
  tone,
  dot,
  className,
}: {
  children: ReactNode;
  tone?: string;
  /** Show a leading status dot (animated for active states). */
  dot?: boolean;
  className?: string;
}) {
  const cls = (tone && TONE[tone]) ?? "bg-muted text-muted-foreground ring-border";
  const live = tone ? ACTIVE_STATES.includes(tone as JobState) : false;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        cls,
        className,
      )}
    >
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full bg-current",
            live && "auriga-live-dot",
          )}
        />
      )}
      {children}
    </span>
  );
}
