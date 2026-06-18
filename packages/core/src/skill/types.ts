/**
 * The Skill contract: the interface between the harness (consumer) and the Skill
 * platform (system of record). The harness integrates with this; it does not
 * rebuild the platform. See ./README.md for the full design.
 */

export type SkillType = "knowledge" | "tool";

/** Cheap, progressive-disclosure descriptor injected into context at job start. */
export interface SkillMetadata {
  name: string;
  description: string;
  /** The resolvable (latest published) version. */
  version: string;
  type: SkillType;
}

/** One file in a skill bundle, content-addressed by its own hash. */
export interface SkillFileEntry {
  /** Bundle-relative path, e.g. "scripts/run.ts" or "reference/data.csv". */
  path: string;
  /** sha256 (hex) of the file's bytes. */
  hash: string;
  size: number;
  /** True for tool scripts that become callable tools. */
  executable?: boolean;
}

/** A tool-skill entrypoint: a bundled script exposed to the harness tool layer. */
export interface SkillEntrypoint {
  tool_name: string;
  description: string;
  /** Bundle-relative path to the executable. */
  command: string;
  input_schema: Record<string, unknown>;
}

/** The portion of a manifest that is hashed to produce the content address. */
export interface SkillContentForHash {
  name: string;
  version: string;
  description: string;
  type: SkillType;
  skill_md: string;
  files: SkillFileEntry[];
  entrypoints?: SkillEntrypoint[];
}

/** Full manifest: content + its content address. */
export interface SkillManifest extends SkillContentForHash {
  /** sha256 (hex) over the canonical content (see computeContentHash). */
  content_hash: string;
}

/**
 * A fetched skill: manifest + the SKILL.md body + bundled file bytes + the
 * platform signature. The harness verifies this before mounting (supply chain).
 */
export interface SignedSkillArtifact {
  manifest: SkillManifest;
  /** Procedural knowledge (SKILL.md body), injected into context. */
  skill_md: string;
  /** Bundled files, path -> base64 bytes. Large blobs may become refs later. */
  blobs: Record<string, string>;
  /** ed25519 signature (base64) over manifest.content_hash. */
  signature: string;
  /** Signing key identifier (for rotation / verification lookup). */
  key_id: string;
}

/** A public key the harness trusts to verify skill signatures. */
export interface VerificationKey {
  key_id: string;
  /** base64-encoded raw ed25519 public key. */
  public_key: string;
}

export interface SkillVerificationResult {
  ok: boolean;
  reason?: string;
}

/** Context for RBAC-filtered resolution at a tenant/role boundary. */
export interface ResolveContext {
  factio: string;
  role: string;
  /** Optional allowlist from the job spec narrowing the permitted set. */
  allowed_skills?: string[];
}

/**
 * The resolution interface. The interim adapter and the future real platform both
 * implement this, so swapping is a config change.
 */
export interface SkillRegistry {
  /** Metadata only, RBAC-filtered (progressive disclosure). */
  resolve(ctx: ResolveContext): Promise<SkillMetadata[]>;
  /** Fetch the full signed artifact for a specific version. */
  fetch(name: string, version: string): Promise<SignedSkillArtifact>;
}

/** One usage observation fed back from the runtime to governance. */
export interface SkillUsage {
  success: boolean;
  cost_usd: number;
}

/** Aggregated usage stats for a skill (drives governance decisions). */
export interface SkillStats {
  name: string;
  uses: number;
  successes: number;
  total_cost_usd: number;
}

/** The runtime → governance feedback channel. */
export interface SkillUsageSink {
  recordUsage(name: string, version: string, usage: SkillUsage): Promise<void>;
}
