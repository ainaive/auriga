import {
  b64Decode,
  PolicyError,
  verifyArtifact,
  type LoadedSkill,
  type ResolveContext,
  type SkillMetadata,
  type SkillRegistry,
  type VerificationKey,
} from "@auriga/core";
import type { Sandbox } from "@auriga/sandbox";
import type { Tool } from "./tool";

export interface SkillResolverOptions {
  registry: SkillRegistry;
  /** Public keys the harness trusts; signatures are verified against these. */
  trustedKeys: VerificationKey[];
  /** Tenant/role context (RBAC-filtered at resolution). */
  context: ResolveContext;
}

export interface MountedSkill {
  metadata: SkillMetadata;
  loaded: LoadedSkill;
  skill_md: string;
  mountPath: string;
}

/**
 * Resolves, verifies, mounts, and injects skills for one job. Implements
 * progressive disclosure: only metadata is exposed up front; the full SKILL.md
 * body and bundled files are fetched, signature-verified, and mounted only when a
 * skill is selected. Access is gated in code (not the prompt).
 */
export class SkillResolver {
  private cache?: SkillMetadata[];
  private readonly mounted = new Map<string, MountedSkill>();

  constructor(private readonly opts: SkillResolverOptions) {}

  /** Metadata-only, RBAC-filtered list (cached for the job). */
  async listAvailable(): Promise<SkillMetadata[]> {
    if (!this.cache) this.cache = await this.opts.registry.resolve(this.opts.context);
    return this.cache;
  }

  /** A cheap catalog (name + description) for injection into the system prompt. */
  async catalogPrompt(): Promise<string> {
    const list = await this.listAvailable();
    if (!list.length) return "";
    const lines = list.map((m) => `- ${m.name} (v${m.version}): ${m.description}`);
    return `Available skills — call select_skill to load one before relying on it:\n${lines.join("\n")}`;
  }

  /** Exact skill versions mounted so far (for the job trace / checkpoint). */
  loadedSkills(): LoadedSkill[] {
    return [...this.mounted.values()].map((m) => m.loaded);
  }

  /**
   * Fetch → verify signature → mount onto the sandbox FS → return the SKILL.md
   * body for context injection. Idempotent per name. Throws PolicyError if the
   * skill isn't permitted (code-level gate) or fails signature verification.
   */
  async select(sandbox: Sandbox, name: string): Promise<MountedSkill> {
    const existing = this.mounted.get(name);
    if (existing) return existing;

    const available = await this.listAvailable();
    const metadata = available.find((m) => m.name === name);
    if (!metadata) {
      throw new PolicyError(`skill not permitted or not found: ${name}`);
    }

    const artifact = await this.opts.registry.fetch(name, metadata.version);
    const verification = await verifyArtifact(artifact, this.opts.trustedKeys);
    if (!verification.ok) {
      throw new PolicyError(
        `skill signature verification failed for ${name}@${metadata.version}: ${verification.reason}`,
      );
    }

    const files: Record<string, Uint8Array> = {};
    for (const [path, b64] of Object.entries(artifact.blobs)) files[path] = b64Decode(b64);
    files["SKILL.md"] = new TextEncoder().encode(artifact.skill_md);
    const mountPath = await sandbox.mountSkill(name, files);

    const mounted: MountedSkill = {
      metadata,
      loaded: {
        name: artifact.manifest.name,
        version: artifact.manifest.version,
        content_hash: artifact.manifest.content_hash,
      },
      skill_md: artifact.skill_md,
      mountPath,
    };
    this.mounted.set(name, mounted);
    return mounted;
  }
}

/**
 * The model-invoked tool for loading a skill on demand. Returns the SKILL.md body
 * as the tool result, so the full instructions enter context only after selection.
 */
export function makeSelectSkillTool(resolver: SkillResolver, sandbox: Sandbox): Tool {
  return {
    name: "select_skill",
    description:
      "Load a skill by name to mount its files and get its full instructions. Load a skill before relying on its guidance.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Skill name from the available list." } },
      required: ["name"],
    },
    async run(input) {
      const name = typeof input.name === "string" ? input.name : "";
      if (!name) throw new Error("name is required");
      const mounted = await resolver.select(sandbox, name);
      return `Loaded skill "${mounted.metadata.name}" (v${mounted.loaded.version}), mounted at ${mounted.mountPath}.\n\n${mounted.skill_md}`;
    },
  };
}
