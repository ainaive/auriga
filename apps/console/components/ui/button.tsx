import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary";

const variants: Record<Variant, string> = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-700 disabled:bg-neutral-400",
  secondary:
    "border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-100 disabled:bg-neutral-50 disabled:text-neutral-400",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
