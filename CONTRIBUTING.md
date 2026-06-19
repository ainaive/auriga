# Contributing to Auriga

Thanks for working on Auriga. This guide covers the local setup, the QA gate, the git hooks, and the
commit/PR conventions the repo enforces. For the big picture, start with the
[architecture doc](./docs/architecture.md).

## Prerequisites & setup

- **[Bun](https://bun.sh) 1.3.12** — the toolchain and test runner (CI pins this version).
- Optional: **Docker** + **Postgres** for the live integration paths (see [Testing](#testing) below).

```bash
bun install        # installs workspace deps AND installs the git hooks (via the `prepare` script)
bun run check      # the full QA gate — must be green before you push
```

## The QA gate

`bun run check` is the single source of truth for "is this change OK?". It runs three steps in order:

```
bun run check  =  tsc --noEmit          (typecheck the whole workspace)
               →  biome check           (lint + format check)
               →  bun test packages apps scripts
```

Run the pieces individually while iterating:

| Command | What it does |
|---|---|
| `bun run typecheck` | `tsc --noEmit` across the workspace |
| `bun run lint` | `biome check` (lint + format, read-only) |
| `bun run format` | `biome check --write` (auto-fix lint + format) |
| `bun run test` | `bun test packages apps scripts` |

[Biome](https://biomejs.dev) (v2.5) owns formatting and linting; its config is [`biome.json`](./biome.json)
(2-space indent, 100-col width, double quotes, semicolons, trailing commas). Markdown and `apps/console`
are excluded from the gate.

## Git hooks

[lefthook](https://lefthook.dev) installs these hooks on `bun install` (see [`lefthook.yml`](./lefthook.yml)):

| Hook | Runs |
|---|---|
| **pre-commit** | `biome check` on staged `*.{ts,tsx,js,json}` **and** `bun run typecheck` (in parallel) |
| **commit-msg** | `commitlint` on your message |
| **pre-push** | `bun test packages apps scripts` |

To bypass in an emergency, the usual `git commit --no-verify` works — but CI runs the same gate, so prefer
fixing the issue.

## Commit conventions

Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint via
[`commitlint.config.js`](./commitlint.config.js)):

```
<type>(<optional scope>): <subject>

<optional body>
```

Common types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`.

Two rules that bite if you forget them:

- **The subject must start lowercase.** commitlint rejects sentence-case / start-case subjects
  (`subject-case`). Write `feat(api): add health route`, not `feat(api): Add health route`.
- **No `Co-Authored-By` trailer.** Do not add co-author trailers to commit messages in this repo.

Long, detailed multi-line bodies and footers are fine (the line-length rules are disabled).

## Branches & pull requests

- Branch per unit of work (e.g. `docs`, `phase-5-finish`); keep one commit per logical change.
- Open a PR against `main`. CI runs two jobs — `check` (the hermetic gate) and `integration` (live
  Docker + Postgres) — and CodeRabbit reviews the diff. See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml).
- Address review findings (or document why a finding is intentionally skipped), get CI green, then merge.

## Testing

The default gate is **hermetic** — it uses the in-memory / file / local / stub drivers and needs no Docker,
Postgres, or network. The production-only paths run separately:

- **Postgres integration tests** are gated on `DATABASE_URL` and skip when it's unset.
- **Docker sandbox contract tests** are gated on `AURIGA_DOCKER_TESTS=1` (and Docker being available).

Both run live only in the CI **`integration`** job (a `postgres:17` service container + Docker on the
runner). To run them locally:

```bash
# with a local Postgres reachable at $DATABASE_URL and Docker running:
DATABASE_URL=postgres://auriga:auriga@localhost:5432/auriga AURIGA_DOCKER_TESTS=1 \
  bun test packages/habenae packages/sandbox
```

The Next.js console (`apps/console`) is excluded from the Bun gate and is verified with its own
`bun run build` (i.e. `next build`).

## Environment variables

The complete set across all surfaces (grepped from `process.env.*`):

| Variable | Surface | Default | Purpose |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | CLI, worker | — | Live model auth (required to run jobs) |
| `AURIGA_HOME` | CLI, API | `./.auriga/jobs` | Root of the file-backed store + audit log |
| `AURIGA_MODEL` | CLI | `claude-sonnet-4-6` | Default model handle for new runs |
| `AURIGA_SKILLS` | CLI (`skills`) | — | Path to a dev skill registry |
| `AURIGA_REQUIRE_DOCKER` | CLI | unset | `1` requires an isolated Docker sandbox (no Local fallback) |
| `AURIGA_FACTIO` | console | `default` | Tenant the console sends on tenant-scoped calls |
| `AURIGA_ROLE` | console | `viewer` | Role the console sends on tenant-scoped calls |
| `PORT` | API | `8787` | HTTP API listen port |
| `NEXT_PUBLIC_AURIGA_API` | console | `http://localhost:8787` | API base URL the console fetches |
| `DATABASE_URL` | tests, prod store | — | Postgres connection string; enables the Postgres integration tests |
| `AURIGA_DOCKER_TESTS` | tests, CI | unset | `1` opts into the live Docker sandbox contract tests |

The HTTP API caller identity uses the `x-auriga-factio` / `x-auriga-role` request **headers**, not env
vars (see [api.md](./docs/api.md)). The Slack signing secret is supplied by whoever wires the ChatOps
adapter.
