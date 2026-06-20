import { LoginForm } from "@/components/login-form";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-sm flex-col justify-center">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <span className="grid size-11 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-card">
          A
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Sign in to Auriga</h1>
          <p className="mt-1 text-sm text-muted-foreground">Control-plane console</p>
        </div>
      </div>
      <Card>
        <LoginForm passwordRequired={Boolean(process.env.AURIGA_DEV_PASSWORD)} />
        <p className="mt-4 text-xs text-muted-foreground">
          Dev sign-in — sets a session for this browser. Production sits behind an auth proxy.
        </p>
      </Card>
    </div>
  );
}
