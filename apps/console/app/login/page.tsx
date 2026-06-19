import { LoginForm } from "@/components/login-form";
import { Card, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm">
      <Card>
        <CardTitle>Sign in to Auriga</CardTitle>
        <LoginForm passwordRequired={Boolean(process.env.AURIGA_DEV_PASSWORD)} />
        <p className="mt-3 text-xs text-neutral-500">
          Dev sign-in — sets a session for this browser. Production sits behind an auth proxy.
        </p>
      </Card>
    </main>
  );
}
