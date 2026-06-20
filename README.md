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

## Documentation

Full docs live in [`docs/`](./docs):

- **[Architecture](./docs/architecture.md)** — thesis, components, the job lifecycle + request-flow diagrams, and the swappable seams.
- **[CLI manual](./docs/cli.md)** — every `auriga` command, with flags, env vars, and examples.
- **[HTTP API & ChatOps](./docs/api.md)** — routes + the header auth scheme, plus the Slack surface.
- **[Contributing](./CONTRIBUTING.md)** — setup, the QA gate, git hooks, and commit/PR conventions.
- **[Skill contract](./packages/core/src/skill/README.md)** — the progressive-disclosure + signing spec.

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
  evals/          deterministic trace replay + eval runner (Phase 2+)
  cli/            CLI surface
  chatops/        chat command layer + Slack adapter (Phase 5)
apps/
  api/            Hono system API (Phase 3+)
  console/        Next.js + Tailwind 4 + shadcn/ui console — primary web surface, live runs (Phase 6)
```

## Toolchain

- **Runtime:** [Bun](https://bun.sh) (all TypeScript). Node 24+ is the fallback for the worker if a
  dependency proves Bun-incompatible.
- **Datastores (local):** Postgres + MinIO via `docker-compose.yml`.

## Development

```bash
bun install          # install workspace dependencies
bun run check        # typecheck (tsc --noEmit) + lint (biome) + tests (bun test)
docker compose up -d # start Postgres + MinIO (requires Docker)
```

## Status

Phases 0–6 are complete — the Next.js console is the **primary web surface**, with a real-time live-run
experience and the depth to run everything from the browser. See [`docs/`](./docs) for the architecture,
CLI, API, and contributor guides; the phase-by-phase status below summarizes what each delivered.

- **Phase 0 — contracts + foundation:** ✅ done (job schema, provider seam, skill contract + verify, interim registry, hello-world loop).
- **Phase 1 — minimum viable harness:** ✅ done. One job type ("fix a failing test → green") runs end to end: submit a spec → Plan-Execute-Verify loop in an isolated sandbox with allowlisted tools → a skill loaded via the full seam (progressive disclosure → fetch → signature-verify → mount) → verification gate runs the acceptance command → `done` only on pass; checkpoint/resume on a fresh worker; token + cost recorded.
- **Phase 2 — evals + observability:** ✅ done. Every run records a structured **trace** (model calls, tool calls, skill versions, compaction, verify) persisted to the store; **OpenTelemetry** spans per step (register an exporter to ship to Jaeger/Tempo); a **replay** provider re-runs a trace deterministically and an **eval runner** scores a batch of traces against acceptance criteria; cost is rolled up per run; a **HITL approval gate** pauses jobs that declare `require_approval` until approved.
- **Phase 3 — control plane + governance + multi-tenant:** ✅ done. A **scheduler** drains jobs respecting global + **per-tenant (factio) concurrency quotas** and a job **dependency DAG**; failed jobs are **retried** with backoff; **model routing** (the "reasoning sandwich" — strong model plans, fast model executes) is selected per job; an **RBAC policy gate** governs who may submit and which tools/skills are permitted (tenant-isolated); and a **skill usage feedback loop** records per-skill success/cost back to the registry. `auriga create`/`schedule` and `list --factio` expose it.
- **Phase 4 — scale & governance:** ✅ (backend). An append-only **audit log** records every governed action; a **Hono HTTP API** (`apps/api`) exposes the control plane (jobs, governed submit/approve, dashboard, audit, skill marketplace) and serves a **minimal console**; **backend-agnostic provider routing** picks a provider/model per job (cost-aware: low-budget jobs run on a cheaper backend); a **skill marketplace** ranks skills by adoption; a **governance dashboard** rolls up per-tenant jobs/cost; **GitHub Actions CI** runs the gate on every PR. `auriga audit`/`dashboard`/`skills` expose it.
- **Phase 5 — finish the surfaces & hardening:** ✅ done. **Biome** (lint/format) + **lefthook** git hooks + **commitlint** wired into `bun run check`; a CI **`integration` job** (Postgres service + `AURIGA_DOCKER_TESTS=1`) now runs the Docker sandbox, Postgres store/audit/triggers, and graphile-worker **for real** on the runner; the **Capella console** (`apps/console`: Next.js + Tailwind + shadcn-style) reads the API; **ChatOps** (`packages/chatops`: command parser + handler + Slack signature-verifying adapter) — all unit-tested (live Slack flow needs a real Slack app).
- **Phase 6 — web-first:** ✅ done. The Next.js console is the primary surface where users do everything end to end. An **`EventBus`** seam + a **live run** experience — the `Worker` publishes `state`/`trace`/`progress`(+cost)/`done` events, the API streams them over **SSE** (`GET /jobs/:id/events`, backfill-then-tail), and the console renders a real-time **step timeline** on a **shadcn/ui** design system (Tailwind 4 tokens, accessible primitives). Plus **form-based job authoring**, **live pause/resume**, governance/skills/trace surfaces, and a production Postgres `LISTEN/NOTIFY` bus — with the console's own Vitest gate + CI job.
- **Phase 7 — web depth & hardening:** ✅ done. A **workspace + logs viewer** (file tree over the checkpoint snapshot; Steps/Logs timeline toggle); the **jobs list at scale** (filter/search/pagination + inline run/pause/cancel/approve); **observability** (cost trend, per-model breakdown, quota-utilization bars — CSS/inline-SVG, no chart dep); and **hardening** — a hermetic **Playwright E2E** (stub runner boots the API + console; login → create → watch live → cancel) with an **axe** accessibility baseline, plus a role-gated read-only config UI.

### Try it

```bash
bun install
bun run check                      # typecheck + lint + tests (no Docker needed)
cd apps/console && bun run test && bun run build   # the console's own gate (Vitest + Next build)
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

Run the control-plane API, then the web console (the primary surface):

```bash
AURIGA_HOME=.auriga/jobs bun apps/api/src/index.ts   # control-plane API on http://localhost:8787
cd apps/console && bun run dev                        # web console on http://localhost:3000
```

The console reads/writes the API and streams live runs over SSE; open a job to watch the agent work
step by step. (`apps/api` also serves a minimal fallback HTML console at `/`.)
