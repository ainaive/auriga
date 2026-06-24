import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { FactioPolicy, Policy } from "./governance";
import type { SchedulerQuotas } from "./scheduler";
import { decryptSecret, encryptSecret } from "./secret";

/** A provider's runtime credentials (plaintext in memory; encrypted at rest). */
export interface ProviderCredential {
  apiKey?: string;
  baseURL?: string;
}

/** Runtime-editable control-plane configuration: RBAC + quotas + provider credentials. */
export interface AurigaConfig {
  policies: FactioPolicy[];
  quotas: SchedulerQuotas;
  /** Per-backend credentials keyed by provider kind (anthropic, openai, deepseek, …). */
  providers?: Record<string, ProviderCredential>;
}

const FactioPolicySchema = z.object({
  factio: z.string().min(1),
  roles: z.array(z.string().min(1)),
  allowed_tools: z.array(z.string()).optional(),
  allowed_skills: z.array(z.string()).optional(),
});

const ProviderCredentialSchema = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().url().optional(),
});

export const ConfigSchema = z.object({
  policies: z
    .array(FactioPolicySchema)
    // forFactio resolves by `.find`, so duplicate factios would be silently ignored.
    .refine((ps) => new Set(ps.map((p) => p.factio)).size === ps.length, {
      message: "duplicate factio in policies",
    }),
  quotas: z.object({
    global: z.number().int().positive(),
    perFactio: z.number().int().positive(),
  }),
  providers: z.record(z.string().min(1), ProviderCredentialSchema).optional(),
});

/** Validate untrusted input into an AurigaConfig (throws on a bad shape). */
export function parseConfig(input: unknown): AurigaConfig {
  return ConfigSchema.parse(input);
}

/** Sensible starting point when no config has been written yet. */
export const DEFAULT_CONFIG: AurigaConfig = {
  policies: [{ factio: "default", roles: ["dev", "admin", "viewer"] }],
  quotas: { global: 2, perFactio: 1 },
};

/**
 * Persisted control-plane config. `current()` is a synchronous snapshot of the
 * last-loaded/written value — `StoreBackedPolicy` reads it so policy edits take
 * effect immediately (the sync cache is updated as part of `set`).
 */
export interface ConfigStore {
  get(): Promise<AurigaConfig>;
  set(cfg: AurigaConfig): Promise<void>;
  current(): AurigaConfig;
}

/** In-memory config store (dev/tests). */
export class InMemoryConfigStore implements ConfigStore {
  private cache: AurigaConfig;
  constructor(initial: AurigaConfig = DEFAULT_CONFIG) {
    this.cache = parseConfig(initial);
  }
  async get(): Promise<AurigaConfig> {
    return structuredClone(this.cache);
  }
  current(): AurigaConfig {
    return structuredClone(this.cache);
  }
  async set(cfg: AurigaConfig): Promise<void> {
    this.cache = parseConfig(cfg);
  }
}

/** On-disk shape of a provider credential: the API key is stored encrypted. */
interface DiskProviderCredential {
  apiKeyEnc?: string;
  baseURL?: string;
}

const MASTER_KEY_REQUIRED = "AURIGA_CONFIG_SECRET is required to store provider keys";

/** Encrypt provider apiKeys for persistence (fail closed when no master key is set). */
function toDisk(cfg: AurigaConfig, secret: string | undefined): unknown {
  if (!cfg.providers) return cfg;
  const providers: Record<string, DiskProviderCredential> = {};
  for (const [kind, cred] of Object.entries(cfg.providers)) {
    const entry: DiskProviderCredential = {};
    if (cred.apiKey) {
      if (!secret) throw new Error(MASTER_KEY_REQUIRED);
      entry.apiKeyEnc = encryptSecret(cred.apiKey, secret);
    }
    if (cred.baseURL) entry.baseURL = cred.baseURL;
    providers[kind] = entry;
  }
  return { policies: cfg.policies, quotas: cfg.quotas, providers };
}

/** Decrypt persisted provider apiKeys back into the plaintext in-memory config. */
function fromDisk(raw: unknown, secret: string | undefined): AurigaConfig {
  const obj = raw as { providers?: Record<string, DiskProviderCredential> } & Record<
    string,
    unknown
  >;
  const plain: Record<string, unknown> = { policies: obj.policies, quotas: obj.quotas };
  if (obj.providers) {
    const providers: Record<string, ProviderCredential> = {};
    for (const [kind, disk] of Object.entries(obj.providers)) {
      const cred: ProviderCredential = {};
      if (disk.apiKeyEnc) {
        if (!secret)
          throw new Error("AURIGA_CONFIG_SECRET is required to read stored provider keys");
        cred.apiKey = decryptSecret(disk.apiKeyEnc, secret);
      }
      if (disk.baseURL) cred.baseURL = disk.baseURL;
      providers[kind] = cred;
    }
    plain.providers = providers;
  }
  return parseConfig(plain);
}

/** Config persisted to a single `{AURIGA_HOME}/config.json` (mirrors FileJobStore). */
export class FileConfigStore implements ConfigStore {
  private cache: AurigaConfig;
  private constructor(
    private readonly path: string,
    initial: AurigaConfig,
    private readonly secret: string | undefined,
  ) {
    this.cache = initial;
  }

  /**
   * Load the config file. A missing file (first run) starts from DEFAULT_CONFIG; a
   * present-but-invalid/unreadable file throws, so a parse/permission error surfaces
   * to the operator rather than silently resetting RBAC + quotas. Provider apiKeys are
   * decrypted with the master secret (`AURIGA_CONFIG_SECRET`, overridable for tests).
   */
  static async open(dir: string, opts: { secret?: string } = {}): Promise<FileConfigStore> {
    const secret = opts.secret ?? process.env.AURIGA_CONFIG_SECRET;
    const path = join(dir, "config.json");
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return new FileConfigStore(path, DEFAULT_CONFIG, secret);
      }
      throw err;
    }
    return new FileConfigStore(path, fromDisk(JSON.parse(raw), secret), secret);
  }

  async get(): Promise<AurigaConfig> {
    return structuredClone(this.cache);
  }
  current(): AurigaConfig {
    return structuredClone(this.cache);
  }
  async set(cfg: AurigaConfig): Promise<void> {
    const parsed = parseConfig(cfg);
    const disk = toDisk(parsed, this.secret);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(disk, null, 2)}\n`);
    this.cache = parsed;
  }
}

/** A provider credential with the secret stripped — what the open `GET /config` returns. */
export interface RedactedProvider {
  configured: boolean;
  baseURL?: string;
}

export interface RedactedConfig {
  policies: FactioPolicy[];
  quotas: SchedulerQuotas;
  providers?: Record<string, RedactedProvider>;
}

/** Strip provider apiKeys for the unauthenticated GET — never expose secret material. */
export function redactConfig(cfg: AurigaConfig): RedactedConfig {
  const out: RedactedConfig = { policies: cfg.policies, quotas: cfg.quotas };
  if (cfg.providers) {
    const providers: Record<string, RedactedProvider> = {};
    for (const [kind, cred] of Object.entries(cfg.providers)) {
      providers[kind] = {
        configured: Boolean(cred.apiKey),
        ...(cred.baseURL ? { baseURL: cred.baseURL } : {}),
      };
    }
    out.providers = providers;
  }
  return out;
}

/**
 * Merge an incoming config (from the admin) onto the stored one, applying field-update
 * semantics so plaintext never has to round-trip through the browser. For both `apiKey`
 * and `baseURL`: `undefined` keeps the stored value, `""` clears it, and a non-empty value
 * replaces it. Policies and quotas are full-replace; providers absent from `incoming` are
 * preserved unchanged.
 */
export function mergeProviderSecrets(incoming: AurigaConfig, current: AurigaConfig): AurigaConfig {
  const providers: Record<string, ProviderCredential> = {};
  for (const [kind, cred] of Object.entries(current.providers ?? {})) {
    providers[kind] = { ...cred };
  }
  const mergeField = (incomingVal: string | undefined, prevVal: string | undefined) =>
    incomingVal === undefined ? prevVal : incomingVal === "" ? undefined : incomingVal;
  for (const [kind, cred] of Object.entries(incoming.providers ?? {})) {
    const prev = providers[kind] ?? {};
    const next: ProviderCredential = {};
    const apiKey = mergeField(cred.apiKey, prev.apiKey);
    const baseURL = mergeField(cred.baseURL, prev.baseURL);
    if (apiKey) next.apiKey = apiKey;
    if (baseURL) next.baseURL = baseURL;
    providers[kind] = next;
  }
  // Drop fully-empty entries so an untouched provider doesn't persist as `{}`.
  const cleaned = Object.fromEntries(
    Object.entries(providers).filter(([, c]) => c.apiKey || c.baseURL),
  );
  return {
    policies: incoming.policies,
    quotas: incoming.quotas,
    ...(Object.keys(cleaned).length ? { providers: cleaned } : {}),
  };
}

/** A Policy backed by a ConfigStore — `forFactio` reflects the store's current policies. */
export class StoreBackedPolicy implements Policy {
  constructor(private readonly store: ConfigStore) {}
  forFactio(factio: string): FactioPolicy | undefined {
    return this.store.current().policies.find((p) => p.factio === factio);
  }
}
