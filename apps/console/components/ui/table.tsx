import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Table({ children }: { children: ReactNode }) {
  return <table className="w-full border-collapse text-sm">{children}</table>;
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="text-left text-xs uppercase text-neutral-500">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ children }: { children: ReactNode }) {
  return <tr className="border-b border-neutral-100">{children}</tr>;
}

export function TH({ children }: { children: ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}

export function TD({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2", className)}>{children}</td>;
}
