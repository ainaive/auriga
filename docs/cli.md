# CLI manual

`auriga` is the command-line surface over the control plane. It uses a **file-backed** store rooted at
`AURIGA_HOME` (default `./.auriga/jobs`), so the CLI, [HTTP API](./api.md), and other surfaces can share
the same job data on one machine.

During development, run the source directly:

```bash
bun packages/cli/src/main.ts <command> [args]
```

Once the package is installed it exposes an `auriga` bin, so the examples below also work as
`auriga <command>`.

## Quick start: fix a failing test → green

The first-class job type is "make a failing suite pass". Write a spec, e.g. `job.json`:

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

Then submit, watch, and inspect (needs `ANTHROPIC_API_KEY`):

```bash
export ANTHROPIC_API_KEY=sk-...
auriga submit job.json        # create + run to completion
auriga status job_fix_add     # state + cost
auriga trace job_fix_add      # the recorded trace (model/tool/verify events) + cost
auriga result job_fix_add     # final result summary
```

Without Docker the CLI falls back to the non-isolated **Local** sandbox (with a warning). Set
`AURIGA_REQUIRE_DOCKER=1` to require real isolation. See the [spec contract](./architecture.md#domain-model)
for every `JobSpec` field.

## Command reference

| Command | Purpose | Needs `ANTHROPIC_API_KEY` |
|---|---|---|
| `submit <spec.json>` | Create **and run** a job to completion | yes |
| `create <spec.json>` | Create a **pending** job (for DAGs / batch scheduling) | no |
| `schedule [opts]` | Drain pending jobs respecting quotas + dependencies | yes |
| `run <id>` | Run or resume an existing job (e.g. after approval) | yes |
| `approve <id>` | Grant human approval to a paused job (HITL) | no |
| `status <id>` | Show a job's state, attempts, steps, cost | no |
| `result <id>` | Show a job's final result summary | no |
| `trace <id>` | Print the recorded trace + cost rollup | no |
| `list [--factio F]` | List all jobs (optionally one tenant) | no |
| `audit [--factio F]` | Show the governance audit trail (last 50) | no |
| `dashboard` | Per-tenant job/cost rollup | no |
| `skills [-q query]` | Browse the skill marketplace | no |
| `eval <suite-dir>` | Replay recorded traces and score them | no |

### `submit <spec.json>`
Validates the spec, creates the job, and runs it to completion in one shot, streaming per-attempt
verification results. Exits non-zero (`2`) if the job ends `failed`. If the spec sets `require_approval`,
the run pauses (`paused`) until you `approve` then `run` it.

### `create <spec.json>`
Validates and persists a `pending` job and records a `job.created` audit event, **without** running it.
Use this to stage jobs (especially DAGs via `depends_on`) for `schedule` to drain.

### `schedule [--global N] [--per-factio N] [--max-retries N]`
Drains all `pending` jobs through the scheduler, honoring the dependency DAG and concurrency quotas.

| Flag | Default | Meaning |
|---|---|---|
| `--global N` | `2` | Max jobs running concurrently across all tenants |
| `--per-factio N` | `1` | Max concurrent jobs per tenant |
| `--max-retries N` | `0` | Retry budget for failed jobs (with backoff); `0` disables retries |

Prints a report (`ran / done / failed / blocked / retries`) and exits `2` if anything failed or was blocked.

### `run <id>`
Runs or resumes an existing job, reusing the job's recorded model when set. The primary way to continue a
job that was `paused` for approval (after `approve`) or to resume after a crash.

### `approve <id>`
Sets `approved = true` on a paused job and records a `job.approved` audit event. Then `run <id>` to proceed.

### `status <id>` · `result <id>`
`status` prints a one-line state (`id  state  attempts steps`, cost, and any `reason`). `result` prints the
fuller summary including loaded skills (`name@version`).

### `trace <id>`
Prints the formatted trace (model calls, tool calls, skill loads, verification attempts) and the cost
rollup, or `no trace recorded` if the job hasn't run.

### `list [--factio F]`
Lists jobs newest-first as `id  [factio]  state  cost`. With `--factio F`, scopes to one tenant.

### `audit [--factio F]`
Prints the most recent 50 governance events (`ts  [factio]  action  job_id`). With `--factio F`, scopes to
one tenant. The audit log is append-only.

### `dashboard`
Prints org-wide totals (`jobs · tenants · ~$cost`) followed by a per-tenant rollup with per-state counts.

### `skills [-q <query>]` (alias `--query`)
Browses the skill marketplace, ranked by adoption. **Requires `AURIGA_SKILLS`** to point at a skill
registry directory. With no query it lists everything; `-q` filters.

### `eval <suite-dir>`
Loads a suite of recorded traces and **replays them deterministically** (no live model calls), scoring each
against its acceptance criteria. Prints per-case `✓/✗` and a summary, exiting `2` if any case fails to match.

## Environment variables

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | `submit`, `run`, `schedule` | — | Required to call the live model |
| `AURIGA_HOME` | all | `./.auriga/jobs` | Root of the file-backed store + audit log |
| `AURIGA_MODEL` | `submit`, `schedule` | `claude-sonnet-4-6` | Default model handle for new runs |
| `AURIGA_SKILLS` | `skills` | — | Path to a dev skill registry (required for `skills`) |
| `AURIGA_REQUIRE_DOCKER` | `submit`, `run`, `schedule`, `eval` | unset | `1` rejects the Local fallback and requires an isolated Docker sandbox |
| `USER` | `create`, `approve` | `cli` | Recorded as the audit actor |

See [CONTRIBUTING](../CONTRIBUTING.md#environment-variables) for the full env-var reference across all
surfaces.
