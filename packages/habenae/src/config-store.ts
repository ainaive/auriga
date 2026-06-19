import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { FactioPolicy, Policy } from "./governance";
import type { SchedulerQuotas } from "./scheduler";

/** Runtime-editable control-plane configuration: per-tenant RBAC + scheduler quotas. */
export interface AurigaConfig {
  policies: FactioPolicy[];
  quotas: SchedulerQuotas;
}

const FactioPolicySchema = z.object({
  factio: z.string().min(1),
  roles: z.array(z.string().min(1)),
  allowed_tools: z.array(z.string()).optional(),
  allowed_skills: z.array(z.string()).optional(),
});

export const ConfigSchema = z.object({
  policies: z.array(FactioPolicySchema),
  quotas: z.object({
    global: z.number().int().positive(),
    perFactio: z.number().int().positive(),
  }),
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
    return this.cache;
  }
  current(): AurigaConfig {
    return this.cache;
  }
  async set(cfg: AurigaConfig): Promise<void> {
    this.cache = parseConfig(cfg);
  }
}

/** Config persisted to a single `{AURIGA_HOME}/config.json` (mirrors FileJobStore). */
export class FileConfigStore implements ConfigStore {
  private cache: AurigaConfig;
  private constructor(
    private readonly path: string,
    initial: AurigaConfig,
  ) {
    this.cache = initial;
  }

  /** Load the config file, falling back to (and not writing) DEFAULT_CONFIG when absent/invalid. */
  static async open(dir: string): Promise<FileConfigStore> {
    const path = join(dir, "config.json");
    let initial = DEFAULT_CONFIG;
    try {
      initial = parseConfig(JSON.parse(await readFile(path, "utf8")));
    } catch {
      // missing or invalid → start from the default (a later set() writes the file)
    }
    return new FileConfigStore(path, initial);
  }

  async get(): Promise<AurigaConfig> {
    return this.cache;
  }
  current(): AurigaConfig {
    return this.cache;
  }
  async set(cfg: AurigaConfig): Promise<void> {
    const parsed = parseConfig(cfg);
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, `${JSON.stringify(parsed, null, 2)}\n`);
    this.cache = parsed;
  }
}

/** A Policy backed by a ConfigStore — `forFactio` reflects the store's current policies. */
export class StoreBackedPolicy implements Policy {
  constructor(private readonly store: ConfigStore) {}
  forFactio(factio: string): FactioPolicy | undefined {
    return this.store.current().policies.find((p) => p.factio === factio);
  }
}
