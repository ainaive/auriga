# Skill contract (`@auriga/core/skill`)

The interface between the **harness** (consumer) and the **Skill platform** (system of record for
capabilities). The harness *integrates* with the platform; it does not rebuild it. This module defines the
resolution contract, the artifact + signing model, and the verification logic the harness runs before it
will mount a skill.

## What a skill is

A skill bundles three things, touching three harness layers at once:

| Part | Becomes | Layer |
|---|---|---|
| `skill_md` (SKILL.md body) | procedural knowledge injected into the prompt | context |
| executable scripts (`entrypoints`) | callable tools | tools |
| reference files (`files` / `blobs`) | mounted onto the sandbox FS | sandbox |

`type: "knowledge"` skills contribute context + files; `type: "tool"` skills additionally expose
entrypoints as tools (in-process now, MCP later).

## Resolution contract

```ts
interface SkillRegistry {
  resolve(ctx: ResolveContext): Promise<SkillMetadata[]>;   // metadata only, RBAC-filtered
  fetch(name: string, version: string): Promise<SignedSkillArtifact>;
}
```

- **Progressive disclosure**: `resolve()` returns only `name + description + version + type` — cheap, and
  enough for the loop/model to judge relevance. The full body and files arrive only via `fetch()` once a
  skill is selected.
- **RBAC at the boundary**: `resolve()` filters by `factio` (tenant) + `role`, optionally narrowed by the
  job spec's `allowed_skills`. Access is re-checked in code at the harness policy gate before mount —
  permissions live in code, not the prompt.

## Artifact + signing model

Every skill is **content-addressed + versioned + signed**:

- `computeContentHash(content)` — sha256 over a canonical serialization of the skill content (name,
  version, description, type, SKILL.md body, sorted per-file hashes, sorted entrypoints). Both the signer
  and the verifier use this exact function; ordering never affects the hash.
- The registry signs the content hash with an **ed25519** key (`signContentHash`).
- `SignedSkillArtifact` carries the `manifest` (content + `content_hash`), the `skill_md` body, the
  `blobs` (path → base64 bytes), the `signature`, and the `key_id`.

## Verification (run before mounting — supply-chain critical)

`verifyArtifact(artifact, trustedKeys)` performs three checks, all must pass:

1. **Blob integrity** — each bundled blob's sha256 matches its manifest file hash.
2. **Content address** — the recomputed content hash equals `manifest.content_hash`.
3. **Signature** — the ed25519 signature over `content_hash` verifies against a trusted key (`key_id`).

It returns `{ ok, reason? }` rather than throwing, so the harness can record the failure in the job trace.
Skills carry executable code, so this gate is as critical as sandbox isolation and is never skipped.

## Governance boundary

The runtime consumes **published/certified versions only**; the registry exposes only the published
channel. The exact `name@version` + `content_hash` used by a job is recorded in its trace for
reproducibility and audit.
