"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { login } from "@/lib/actions";
import { Button } from "@/components/ui/button";

const ROLES = ["viewer", "dev", "admin"];

/** Dev sign-in: choose a factio + role (admin is needed to edit config). */
export function LoginForm({ passwordRequired }: { passwordRequired: boolean }) {
  const router = useRouter();
  const [factio, setFactio] = useState("default");
  const [role, setRole] = useState("dev");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await login(factio, role, password);
      if (res.ok) router.push("/");
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block text-sm">
        <span className="text-neutral-600">Factio (tenant)</span>
        <input
          value={factio}
          onChange={(e) => setFactio(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-neutral-600">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {passwordRequired && (
        <label className="block text-sm">
          <span className="text-neutral-600">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
          />
        </label>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
