import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        // Layered, tactile surface: warm card tone over the page, a hairline border,
        // a soft drop shadow for lift, and a faint paper grain on the face.
        "auriga-grain rounded-xl border bg-card text-card-foreground p-5 shadow-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <h3
      className={cn(
        "mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </h3>
  );
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("text-sm", className)}>{children}</div>;
}
