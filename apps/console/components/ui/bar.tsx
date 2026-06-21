import { cn } from "@/lib/utils";

/** A labeled horizontal progress bar (CSS only — no chart dependency). */
export function Bar({
  label,
  value,
  max,
  valueLabel,
  warn,
  className,
}: {
  label: string;
  value: number;
  max: number;
  valueLabel?: string;
  warn?: boolean;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{valueLabel ?? value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted ring-1 ring-inset ring-border/60">
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r",
            warn ? "from-amber-500/80 to-amber-500" : "from-primary/75 to-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
