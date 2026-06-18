import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  b64Encode,
  computeContentHash,
  generateSigningKeypair,
  newId,
  sha256Hex,
  signContentHash,
  type Ed25519Keypair,
  type ResolveContext,
  type SignedSkillArtifact,
  type SkillContentForHash,
  type SkillFileEntry,
  type SkillMetadata,
  type SkillRegistry,
  type SkillType,
  type VerificationKey,
} from "@auriga/core";
import type { SkillBundleInput } from "./bundle";

interface SkillMeta {
  name: string;
  description: string;
  type: SkillType;
  versions: string[];
  latest: string;
}

/**
 * Interim, filesystem-backed implementation of the SkillRegistry contract — a
 * stand-in for the real Skill platform. It content-addresses and ed25519-signs
 * each published artifact, and exposes only published versions. Layout:
 *
 *   <baseDir>/.signing-key.json
 *   <baseDir>/<name>/meta.json         (lightweight, read by resolve())
 *   <baseDir>/<name>/<version>.json    (full SignedSkillArtifact, read by fetch())
 *
 * resolve() touches only meta.json (progressive disclosure — no blobs loaded).
 */
export class LocalSkillRegistry implements SkillRegistry {
  private readonly baseDir: string;
  private readonly keypair: Ed25519Keypair;

  constructor(opts: { baseDir: string; keypair: Ed25519Keypair }) {
    this.baseDir = opts.baseDir;
    this.keypair = opts.keypair;
  }

  /** Public keys the harness should trust for skills signed by this registry. */
  verificationKeys(): VerificationKey[] {
    return [{ key_id: this.keypair.key_id, public_key: this.keypair.public_key }];
  }

  /** Hash, sign, and store a skill bundle (the "publish to governance" step). */
  async publish(bundle: SkillBundleInput): Promise<SignedSkillArtifact> {
    const files: SkillFileEntry[] = [];
    const blobs: Record<string, string> = {};
    for (const f of bundle.files) {
      files.push({
        path: f.path,
        hash: await sha256Hex(f.bytes),
        size: f.bytes.byteLength,
        ...(f.executable ? { executable: true } : {}),
      });
      blobs[f.path] = b64Encode(f.bytes);
    }

    const content: SkillContentForHash = {
      name: bundle.name,
      version: bundle.version,
      description: bundle.description,
      type: bundle.type,
      skill_md: bundle.skill_md,
      files,
      ...(bundle.entrypoints ? { entrypoints: bundle.entrypoints } : {}),
    };
    const content_hash = await computeContentHash(content);
    const signature = await signContentHash(content_hash, this.keypair.private_key);
    const artifact: SignedSkillArtifact = {
      manifest: { ...content, content_hash },
      skill_md: bundle.skill_md,
      blobs,
      signature,
      key_id: this.keypair.key_id,
    };

    const dir = join(this.baseDir, bundle.name);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${bundle.version}.json`), JSON.stringify(artifact));
    await this.updateMeta(bundle);
    return artifact;
  }

  async resolve(ctx: ResolveContext): Promise<SkillMetadata[]> {
    const out: SkillMetadata[] = [];
    for (const name of await this.listNames()) {
      if (ctx.allowed_skills && !ctx.allowed_skills.includes(name)) continue;
      const meta = await this.readMeta(name);
      if (!meta) continue;
      out.push({ name: meta.name, description: meta.description, version: meta.latest, type: meta.type });
    }
    out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return out;
  }

  async fetch(name: string, version: string): Promise<SignedSkillArtifact> {
    const path = join(this.baseDir, name, `${version}.json`);
    try {
      return JSON.parse(await readFile(path, "utf8")) as SignedSkillArtifact;
    } catch (cause) {
      throw new Error(`skill not found: ${name}@${version}`, { cause });
    }
  }

  private async updateMeta(bundle: SkillBundleInput): Promise<void> {
    const metaPath = join(this.baseDir, bundle.name, "meta.json");
    const existing = await this.readMeta(bundle.name);
    const versions = existing ? [...existing.versions] : [];
    if (!versions.includes(bundle.version)) versions.push(bundle.version);
    versions.sort(compareVersions);
    const latest = versions[versions.length - 1] ?? bundle.version;
    const meta: SkillMeta = {
      name: bundle.name,
      // description/type reflect the latest published version
      description: latest === bundle.version ? bundle.description : existing?.description ?? bundle.description,
      type: latest === bundle.version ? bundle.type : existing?.type ?? bundle.type,
      versions,
      latest,
    };
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`);
  }

  private async listNames(): Promise<string[]> {
    try {
      const entries = await readdir(this.baseDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }
  }

  private async readMeta(name: string): Promise<SkillMeta | undefined> {
    try {
      return JSON.parse(await readFile(join(this.baseDir, name, "meta.json"), "utf8")) as SkillMeta;
    } catch {
      return undefined;
    }
  }
}

/**
 * Open (or create) a local registry under baseDir with a persistent dev signing
 * key, so the harness trusts the same key across runs.
 */
export async function openDevRegistry(baseDir: string): Promise<LocalSkillRegistry> {
  await mkdir(baseDir, { recursive: true });
  const keyPath = join(baseDir, ".signing-key.json");
  let keypair: Ed25519Keypair;
  try {
    keypair = JSON.parse(await readFile(keyPath, "utf8")) as Ed25519Keypair;
  } catch {
    keypair = await generateSigningKeypair(newId("key"));
    await writeFile(keyPath, JSON.stringify(keypair));
  }
  return new LocalSkillRegistry({ baseDir, keypair });
}

/** Compare dot-separated versions numerically (segments fall back to lexical). */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = Number(pa[i] ?? 0);
    const y = Number(pb[i] ?? 0);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (x !== y) return x - y;
    } else {
      const sx = pa[i] ?? "";
      const sy = pb[i] ?? "";
      if (sx !== sy) return sx < sy ? -1 : 1;
    }
  }
  return 0;
}
