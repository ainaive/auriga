# Auriga documentation

Auriga is a **harness job platform** for agents — an agent-flavored job scheduler / control plane that runs
a single agent **job** to completion under a managed, observable, governable harness. For the project
overview and quick start, see the [root README](../README.md).

## Start here

| If you want to… | Read |
|---|---|
| Understand how the system fits together | [architecture.md](./architecture.md) — thesis, components, job lifecycle, request flow, the swappable seams |
| Run jobs from the command line | [cli.md](./cli.md) — the full `auriga` command manual |
| Integrate over HTTP or chat | [api.md](./api.md) — HTTP API routes + auth, and the ChatOps/Slack surface |
| Hack on Auriga itself | [../CONTRIBUTING.md](../CONTRIBUTING.md) — setup, the QA gate, hooks, commit & PR conventions |
| Author or understand skills | [../packages/core/src/skill/README.md](../packages/core/src/skill/README.md) — the skill contract spec |

## At a glance

- **Thesis:** `Agent = Model + Harness`; the harness control flow is self-built, infrastructure is glued in
  behind interfaces. ([architecture.md](./architecture.md#thesis))
- **Codenames:** Currus = runtime, Habenae = control plane, Capella = observability, factio = tenancy.
- **Surfaces:** CLI, HTTP API, ChatOps, and a Next.js console — all thin clients of the same control plane.
- **First-class job type:** "fix a failing test → make the suite green" (decidable acceptance via exit code).
