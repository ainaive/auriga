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
    <div className={cn("space-y-1", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate text-foreground">{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{valueLabel ?? value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", warn ? "bg-amber-500" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
