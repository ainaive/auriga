import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A calm placeholder for empty / unavailable data — replaces bare `<p>` messages. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
  children,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 text-center",
        className,
      )}
    >
      {Icon && (
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-inset ring-border">
          <Icon className="size-5" />
        </div>
      )}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}
