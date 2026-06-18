# Auriga

> *Auriga* — "the charioteer": it holds the reins and drives the team.

Auriga is a **harness job platform** for agents — an *agent-flavored job scheduler / control plane*,
not a chat box. It makes a single agent **job** a first-class citizen: a job has a spec, boundaries, and
acceptance criteria; the platform runs it to completion under a managed harness; the whole run is
observable, governable, and billable.

Core thesis: **`Agent = Model + Harness`**. The harness control flow — the agent loop, context
engineering, the job model, the control plane, verification, and the skill resolver — is **self-built**.
Everything else (database, queue, sandbox isolation, telemetry, model SDKs, object storage) is proven
infrastructure we glue together. **No agent-orchestration framework owns the control flow.**

Target use case: **Code Agent / AI programming** (e.g. auto-fix a failing test → PR, migrations,
batch refactors).

## Themed component names

| Name | Latin | Role |
|---|---|---|
| **Currus** | "chariot" | harness runtime — the agent loop inside the sandbox |
| **Habenae** | "the reins" | control plane — scheduling, routing, quotas, state |
| **Capella** | brightest star of Auriga | observability / console |
| **factio** / **Factiones** | a chariot-racing stable | unit of tenancy / agent pool |

## Repository layout

```
packages/
  core/           shared types & schemas (job model, skill contract, provider types)
  provider/       model provider abstraction + Anthropic impl + stub
  sandbox/        Sandbox interface + Docker driver (Phase 1)
  currus/         harness runtime: Plan-Execute-Verify loop, context, tools, verification, skills
  skill-registry/ interim content-addressed + signed skill artifact store
  habenae/        control plane (Phase 1+)
  capella/        observability (Phase 2+)
  cli/            CLI surface
apps/
  worker/         long-running job worker (Phase 1)
  api/            Hono system API (Phase 3+)
  console/        Next.js + Tailwind + shadcn console (Phase 2+, deploys to Vercel)
```

## Toolchain

- **Runtime:** [Bun](https://bun.sh) (all TypeScript). Node 24+ is the fallback for the worker if a
  dependency proves Bun-incompatible.
- **Datastores (local):** Postgres + MinIO via `docker-compose.yml`.

## Development

```bash
bun install          # install workspace dependencies
bun run check        # typecheck (tsc --noEmit) + tests (bun test)
docker compose up -d # start Postgres + MinIO (requires Docker)
```

## Status

Under active construction — see `~/.claude/plans/auriga-implementation-starry-nest.md` for the phased plan.
Phase 0 (contracts + foundation) is in progress.
