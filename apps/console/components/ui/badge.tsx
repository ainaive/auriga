import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  done: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  running: "bg-blue-100 text-blue-800",
  planning: "bg-blue-100 text-blue-800",
  verifying: "bg-amber-100 text-amber-800",
  paused: "bg-amber-100 text-amber-800",
  pending: "bg-neutral-100 text-neutral-700",
};

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
  const cls = (tone && TONE[tone]) ?? "bg-neutral-100 text-neutral-700";
  return (
    <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      {children}
    </span>
  );
}
