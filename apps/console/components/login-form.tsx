"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { login } from "@/lib/actions";

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
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Factio (tenant)" htmlFor="factio">
        <Input id="factio" value={factio} onChange={(e) => setFactio(e.target.value)} />
      </Field>
      <Field label="Role" htmlFor="role">
        <Select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
      </Field>
      {passwordRequired && (
        <Field label="Password" htmlFor="password">
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
      )}
      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </form>
  );
}
