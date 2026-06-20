import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  // Allow wide tables to scroll horizontally on small screens without breaking the card.
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="text-left text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground [&_th]:border-b [&_th]:border-border">
      {children}
    </thead>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <tr
      className={cn(
        "border-b border-border/60 transition-colors last:border-0 hover:bg-accent/50",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TH({ children }: { children: ReactNode }) {
  return (
    <th scope="col" className="px-3 py-2.5 font-semibold">
      {children}
    </th>
  );
}

export function TD({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2.5 align-top", className)}>{children}</td>;
}
