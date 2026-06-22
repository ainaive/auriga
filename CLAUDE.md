# CLAUDE.md

Guidance for Claude Code (and other coding agents) working in this repo. Keep it accurate — if you change
the toolchain, gate, or conventions, update this file. Detailed docs live in [`docs/`](docs); read
[`docs/architecture.md`](docs/architecture.md) before making non-trivial changes.

## What this is

**Auriga** is a harness job platform for agents — an agent-flavored job scheduler / control plane. Thesis:
`Agent = Model + Harness`. We **self-build the harness control flow** (the agent loop, job model, control
plane, verification, skill resolver) and **glue proven infrastructure behind interfaces** for everything
else. Two hard rules: **never self-build sandbox isolation** (use the Docker driver), and **no
agent-orchestration framework owns the control flow**.

## Toolchain

- **Bun 1.3.12**, all TypeScript, Bun workspaces (`packages/*`, `apps/*`). Use `bun` — never
  `npm` / `node` / `yarn` / `pnpm`.
- Add deps with `bun add`; run scripts with `bun run <script>`.

## Commands

```bash
bun install                              # deps + installs git hooks (prepare → lefthook)
bun run check                            # THE GATE: tsc --noEmit → biome check → bun test
bun run format                           # auto-fix lint + formatting (biome) — run before committing
bun packages/cli/src/main.ts <command>   # run the CLI in dev (see docs/cli.md)
bun apps/api/src/index.ts                # run the HTTP API (http://localhost:8787)
cd apps/console && bun run build         # build the Next.js console (excluded from the Bun gate)
```

`bun run check` must be green before you push.

## Conventions & gotchas

- **Conventional Commits with a lowercase-start subject.** commitlint rejects start-case/sentence-case
  subjects — write `feat(api): add health route`, not `feat(api): Add health route`.
- **Never add a `Co-Authored-By` trailer** to commit messages.
- **lefthook** hooks run automatically: pre-commit (biome + typecheck), commit-msg (commitlint), pre-push
  (tests). Don't `--no-verify` around a real failure; CI runs the same gate.
- **Biome** owns formatting and linting — run `bun run format` before committing `*.{ts,tsx,js,json}`.
- **Flow:** branch per change → PR to `main` → CI (`check` + `integration`) + CodeRabbit review → merge.
- Commit/push only when asked.

## Testing model

- The default gate is **hermetic**: in-memory / file / local / stub drivers, no Docker, Postgres, or
  network. This is what `bun run check` runs.
- Live **Postgres** tests are gated on `DATABASE_URL`; live **Docker sandbox** tests on
  `AURIGA_DOCKER_TESTS=1`. Both run **only in the CI `integration` job**.
- **Docker is not available locally** — don't expect to run the Docker/Postgres paths here; rely on CI.
- The console (`apps/console`) is outside the Bun gate; verify it with its own `bun run build`.

## Architecture orientation

Codenames: **Currus** = harness runtime (`packages/currus`), **Habenae** = control plane
(`packages/habenae`), **Capella** = observability (`packages/capella`), **factio** = tenant. Surfaces
(CLI, HTTP API, ChatOps, console) are thin clients over the same control plane.

- **Zod schemas in [`@auriga/core`](packages/core) are the source of truth**; types are inferred from them.
- Every external concern is a **swappable seam** (store, queue, sandbox, provider, registry, audit) with a
  real driver + a test/dev driver — see the table in [`docs/architecture.md`](docs/architecture.md).
- **There is no `apps/worker`.** The `Worker` is a class in [`@auriga/habenae`](packages/habenae); the only
  apps are `apps/api` and `apps/console`.
- **Model backend is chosen by the model-id prefix** via `providerFor(modelId)` in
  [`@auriga/provider`](packages/provider): `claude-*` → Anthropic (`ANTHROPIC_API_KEY`), `gpt-*`/`o*` →
  OpenAI (`OPENAI_API_KEY`), `gemini-*` → Gemini (`GEMINI_API_KEY`/`GOOGLE_API_KEY`), vendor-prefixed
  ids like `us.anthropic.*` → Bedrock (AWS credential chain + `AWS_REGION`). OpenAI-compatible gateways
  reuse `OpenAIProvider` via the `OPENAI_COMPATIBLE` registry: `deepseek-*` (`DEEPSEEK_API_KEY`), `qwen*`
  → Bailian (`DASHSCOPE_API_KEY`), `kimi*`/`moonshot*` (`MOONSHOT_API_KEY`), `glm-*` → Zhipu
  (`ZHIPU_API_KEY`). An explicit `vendor/model` id (e.g. `bailian/deepseek-r1`) forces the backend;
  `resolveModel` returns the stripped id to run. Call sites gate on `hasCredentials(kind)` before constructing.

## More

- [`docs/architecture.md`](docs/architecture.md) — system design, lifecycle + flow diagrams, the seams.
- [`docs/cli.md`](docs/cli.md) — every `auriga` command.
- [`docs/api.md`](docs/api.md) — HTTP routes + header auth, and the ChatOps/Slack surface.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup, the gate, hooks, conventions, the full env-var table.
- [`packages/core/src/skill/README.md`](packages/core/src/skill/README.md) — the skill contract spec.
