import { sparklinePoints } from "@/lib/sparkline";
import { cn } from "@/lib/utils";

export function Sparkline({
  values,
  className,
  ariaLabel,
}: {
  values: number[];
  className?: string;
  ariaLabel?: string;
}) {
  const W = 240;
  const H = 40;
  const points = sparklinePoints(values, W, H);
  if (!points) return <span className="text-xs text-muted-foreground">no data</span>;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? "trend"}
      className={cn("h-10 w-full text-primary", className)}
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
