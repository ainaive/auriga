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

- **Phase 0 — contracts + foundation:** ✅ done (job schema, provider seam, skill contract + verify, interim registry, hello-world loop).
- **Phase 1 — minimum viable harness:** ✅ done. One job type ("fix a failing test → green") runs end to end: submit a spec → Plan-Execute-Verify loop in an isolated sandbox with allowlisted tools → a skill loaded via the full seam (progressive disclosure → fetch → signature-verify → mount) → verification gate runs the acceptance command → `done` only on pass; checkpoint/resume on a fresh worker; token + cost recorded.
- **Phase 2 — evals + observability:** ✅ done. Every run records a structured **trace** (model calls, tool calls, skill versions, compaction, verify) persisted to the store; **OpenTelemetry** spans per step (register an exporter to ship to Jaeger/Tempo); a **replay** provider re-runs a trace deterministically and an **eval runner** scores a batch of traces against acceptance criteria; cost is rolled up per run; a **HITL approval gate** pauses jobs that declare `require_approval` until approved.
- **Phase 3 — control plane + governance + multi-tenant:** ✅ done. A **scheduler** drains jobs respecting global + **per-tenant (factio) concurrency quotas** and a job **dependency DAG**; failed jobs are **retried** with backoff; **model routing** (the "reasoning sandwich" — strong model plans, fast model executes) is selected per job; an **RBAC policy gate** governs who may submit and which tools/skills are permitted (tenant-isolated); and a **skill usage feedback loop** records per-skill success/cost back to the registry. `auriga create`/`schedule` and `list --factio` expose it.
- **Phase 4 — scale & governance:** ✅ (backend). An append-only **audit log** records every governed action; a **Hono HTTP API** (`apps/api`) exposes the control plane (jobs, governed submit/approve, dashboard, audit, skill marketplace) and serves a **minimal console**; **backend-agnostic provider routing** picks a provider/model per job (cost-aware: low-budget jobs run on a cheaper backend); a **skill marketplace** ranks skills by adoption; a **governance dashboard** rolls up per-tenant jobs/cost; **GitHub Actions CI** runs the gate on every PR. `auriga audit`/`dashboard`/`skills` expose it. *Remaining:* the richer **Next.js + shadcn console** (`apps/console`) and ChatOps (Slack).

### Try it

```bash
bun install
bun run check                      # typecheck + tests (110+ tests, no Docker needed)
cd packages/currus && bun run hello   # hello-world loop (stub; set ANTHROPIC_API_KEY for live)
```

Run a job (needs `ANTHROPIC_API_KEY`). Write a job spec, e.g. `job.json`:

```json
{
  "id": "job_fix_add",
  "factio": "default",
  "created_by": "you@example.com",
  "goal": "Fix the bug in src/add.ts so the test suite passes.",
  "context_refs": { "workspace": { "kind": "dir", "url_or_path": "./fixtures/failing-test" } },
  "allowed_tools": ["read_file", "write_file", "bash", "git", "search"],
  "acceptance_criteria": [{ "kind": "command", "cmd": "bun test", "expect_exit": 0 }],
  "budget": { "max_tokens": 200000, "max_wall_time_s": 600, "max_cost_usd": 5, "max_steps": 30 }
}
```

```bash
# during development (run the source directly):
bun packages/cli/src/main.ts submit job.json
bun packages/cli/src/main.ts status job_fix_add
bun packages/cli/src/main.ts trace job_fix_add     # recorded trace + cost
bun packages/cli/src/main.ts approve job_fix_add   # grant HITL approval, then `run`
bun packages/cli/src/main.ts eval ./eval-suite     # replay + score recorded traces

# or, once installed (the package exposes an `auriga` bin):
auriga submit job.json
```

Without Docker, the CLI falls back to the non-isolated Local sandbox (with a warning);
set `AURIGA_REQUIRE_DOCKER=1` to require real isolation.

Run the control-plane API + console:

```bash
AURIGA_HOME=.auriga/jobs bun apps/api/src/index.ts   # http://localhost:8787 (console at /)
```
