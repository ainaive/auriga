import type {
  ResolveContext,
  SkillRegistry,
  SkillStats,
  SkillStatsSource,
  SkillType,
} from "@auriga/core";

export interface MarketplaceEntry {
  name: string;
  description: string;
  version: string;
  type: SkillType;
  stats: SkillStats;
}

export interface MarketplaceDeps {
  registry: SkillRegistry;
  stats: SkillStatsSource;
}

/**
 * Discover skills (RBAC-filtered metadata) joined with usage stats, optionally
 * filtered by a query and ranked by adoption (uses, then successes).
 */
export async function searchSkills(
  deps: MarketplaceDeps,
  ctx: ResolveContext,
  opts: { query?: string } = {},
): Promise<MarketplaceEntry[]> {
  const metas = await deps.registry.resolve(ctx);
  const q = opts.query?.toLowerCase();
  const filtered = q
    ? metas.filter(
        (m) => m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q),
      )
    : metas;

  const entries: MarketplaceEntry[] = await Promise.all(
    filtered.map(async (m) => ({
      name: m.name,
      description: m.description,
      version: m.version,
      type: m.type,
      stats: await deps.stats.stats(m.name),
    })),
  );

  entries.sort(
    (a, b) =>
      b.stats.uses - a.stats.uses ||
      b.stats.successes - a.stats.successes ||
      a.name.localeCompare(b.name),
  );
  return entries;
}
