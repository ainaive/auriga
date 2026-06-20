"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { logout } from "@/lib/actions";

export function LogoutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(async () => {
        await logout();
        router.push("/login");
      })}
      disabled={pending}
      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {pending ? "…" : "logout"}
    </button>
  );
}
