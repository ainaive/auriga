# HTTP API & ChatOps reference

Two more surfaces over the same control plane: a Hono **HTTP API** (`apps/api`) and a **ChatOps** layer
(`packages/chatops`) with a Slack adapter. Both enforce the same RBAC + tenancy as the [CLI](./cli.md).

## HTTP API

Run the dev server (file-backed store, permissive `default` policy):

```bash
AURIGA_HOME=.auriga/jobs bun apps/api/src/index.ts
# auriga api listening on http://localhost:8787  (console served at /)
```

Override the port with `PORT`. Production deployments supply a real `Policy` (and the Postgres store / a
real skill registry) when constructing the app via `createApp(deps)` — see
[`apps/api/src/app.ts`](../apps/api/src/app.ts).

### Authentication

The caller's identity is carried by two headers (in production the API sits behind the platform's
OIDC/auth gateway, which sets them):

```
x-auriga-factio: <tenant>
x-auriga-role:   <role>
```

- **Tenant-scoped routes** (all `/jobs*`) require **both** headers and return `401` if either is missing.
  Per-tenant isolation is defense-in-depth: a job id from another factio returns `404` (not `403`), so
  existence never leaks across tenants.
- **Aggregate governance routes** (`/dashboard`, `/audit`, `/skills`), `/health`, and the console (`/`) are
  **open by design** and expected to be gated by the deployment's auth proxy — the handlers don't read the
  actor headers.

### Routes

| Method | Path | Auth | Purpose | Status codes |
|---|---|---|---|---|
| `GET` | `/health` | open | Liveness probe → `{ ok: true }` | `200` |
| `GET` | `/jobs` | tenant | List the caller's jobs (`listByFactio`) | `200`, `401` |
| `GET` | `/jobs/:id` | tenant | Fetch one job record | `200`, `401`, `404` |
| `GET` | `/jobs/:id/trace` | tenant | Fetch the recorded trace | `200`, `401`, `404` |
| `POST` | `/jobs` | tenant | Create a **pending** job (body `{ spec }`) through the RBAC gate | `201`, `400`, `401`, `403` |
| `POST` | `/jobs/:id/approve` | tenant | Approve a paused job (HITL); audited | `200`, `401`, `404` |
| `GET` | `/dashboard` | open | Org-wide totals + per-tenant rollup | `200` |
| `GET` | `/audit` | open | Audit events; `?factio=F` filters | `200` |
| `GET` | `/skills` | open | Marketplace; `?q=`, `?factio=` (default `default`), `?role=` (default `viewer`) | `200` |
| `GET` | `/` | open | Minimal served HTML console | `200` |

`POST /jobs` returns `400` for invalid JSON or a spec that fails validation, and `403` (with the
`PolicyError` message) when the RBAC gate denies the actor/tenant/tools/skills. Running the job is the
worker/scheduler's responsibility — the API only creates it `pending`.

### Examples

```bash
# Submit a pending job (tenant-scoped → needs both headers)
curl -sX POST http://localhost:8787/jobs \
  -H 'content-type: application/json' \
  -H 'x-auriga-factio: default' -H 'x-auriga-role: dev' \
  -d '{"spec": { ...JobSpec... }}'

# List your jobs / fetch one / its trace
curl -s http://localhost:8787/jobs            -H 'x-auriga-factio: default' -H 'x-auriga-role: viewer'
curl -s http://localhost:8787/jobs/job_fix_add -H 'x-auriga-factio: default' -H 'x-auriga-role: viewer'
curl -s http://localhost:8787/jobs/job_fix_add/trace -H 'x-auriga-factio: default' -H 'x-auriga-role: viewer'

# Approve a paused job
curl -sX POST http://localhost:8787/jobs/job_fix_add/approve \
  -H 'x-auriga-factio: default' -H 'x-auriga-role: dev'

# Open governance views (no headers; gate at your proxy)
curl -s http://localhost:8787/dashboard
curl -s 'http://localhost:8787/audit?factio=default'
curl -s 'http://localhost:8787/skills?q=test'
```

The [`apps/console`](../apps/console) Next.js console is a thin read-side client of these routes; it sends
the actor headers for the tenant-scoped calls and reads the open routes directly.

## ChatOps

`@auriga/chatops` is a platform-agnostic command layer plus a Slack adapter. A chat user is mapped to an
`Actor` (factio + role) by the adapter, and every command runs through the same control-plane gates.

### Commands

Parsed by [`packages/chatops/src/commands.ts`](../packages/chatops/src/commands.ts):

| Command | Action |
|---|---|
| `help` | Show the command list |
| `list [factio]` | Your jobs (defaults to the caller's factio; a different factio is refused) |
| `status <id>` | A job's state, attempts, steps (tenant-scoped) |
| `approve <id>` | Approve a paused job — gated by the same RBAC check as submit |
| `dashboard` | Tenant rollup, **scoped to the caller's factio** (no org-wide leak) |
| `submit <job-json>` | Submit a job spec (inline JSON), through the RBAC gate |

Dispatch happens in [`handler.ts`](../packages/chatops/src/handler.ts) against a `JobStore` + `Policy` +
`Actor` (and an optional `AuditLog`).

### Slack adapter

[`packages/chatops/src/slack.ts`](../packages/chatops/src/slack.ts) wires the commands to Slack
slash-commands:

- **Signature verification** — `verifySlackSignature` recomputes the v0 HMAC-SHA256 over
  `v0:<timestamp>:<body>` and compares in constant time, rejecting requests older than a **300-second**
  replay window. `handleSlackCommand` returns `401` on a bad signature before doing anything else.
- **Slash-command parsing** — `parseSlashCommand` reads `text` / `user_id` / `user_name` from the
  `application/x-www-form-urlencoded` payload.
- **End-to-end** — `handleSlackCommand` verifies → parses → dispatches → returns `{ status, reply }`.

> The signing secret is supplied by the caller wiring the adapter (not read from the environment in this
> repo). The command logic and signature verification are fully unit-tested; the **live Slack round-trip
> still needs a real Slack app + credentials** to validate end to end.
