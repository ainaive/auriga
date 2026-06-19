# @auriga/console — Capella web console

The read-side console (Capella) for Auriga: a Next.js (App Router) + Tailwind v4 + shadcn-style UI that
consumes the control-plane HTTP API (`apps/api`). Pages: dashboard, jobs (tenant-scoped), job detail with
trace, and the skill marketplace.

This is a **thin client** — it talks to the API over HTTP and defines its own response types; it does not
import the Bun/server packages. It deploys to Vercel; the engine (worker/scheduler/sandboxes) runs on a
VM/K8s, not on Vercel serverless.

## Develop / build

```bash
bun install
cd apps/console
bun run dev      # http://localhost:3000 (expects the API at NEXT_PUBLIC_AURIGA_API)
bun run build    # production build (used as the CI/verification gate for this app)
```

Env:
- `NEXT_PUBLIC_AURIGA_API` — API base URL (default `http://localhost:8787`).
- `AURIGA_FACTIO` / `AURIGA_ROLE` — tenant + role sent as `x-auriga-factio`/`x-auriga-role` headers for
  the tenant-scoped endpoints (default `default` / `viewer`).

> Excluded from the root Bun `tsc`/`bun test`/Biome gate — it builds via Next's own pipeline.
