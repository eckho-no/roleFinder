import { and, desc, eq, sql } from "drizzle-orm";
import type { getDb } from "../client";
import { companies, listings, scores } from "../schema";
import {
  listingStatusSchema,
  sourceSchema,
  tierSchema,
  triageSchema,
  type ListingStatus,
  type Source,
  type Tier,
  type Triage,
} from "../schema/unions";

export type DashboardFilters = {
  tier?: Tier;
  status?: ListingStatus;
  triage?: Triage;
  source?: Source;
};

/**
 * Parses the dashboard's `searchParams` (tier/status/triage/source, each a
 * plain `?key=value`) into `DashboardFilters`, dropping anything that isn't
 * one of the known enum values instead of throwing — an old bookmark or a
 * hand-edited URL with a stale value should degrade to "no filter on that
 * key", not a 500.
 */
export function parseDashboardFilters(
  searchParams: Record<string, string | string[] | undefined>,
): DashboardFilters {
  function first(value: string | string[] | undefined): string | undefined {
    return Array.isArray(value) ? value[0] : value;
  }

  const tier = tierSchema.safeParse(first(searchParams.tier));
  const status = listingStatusSchema.safeParse(first(searchParams.status));
  const triage = triageSchema.safeParse(first(searchParams.triage));
  const source = sourceSchema.safeParse(first(searchParams.source));

  return {
    tier: tier.success ? tier.data : undefined,
    status: status.success ? status.data : undefined,
    triage: triage.success ? triage.data : undefined,
    source: source.success ? source.data : undefined,
  };
}

export type FilteredListing = {
  listingId: number;
  title: string;
  companyName: string;
  status: ListingStatus;
  triage: Triage;
  source: Source;
  tier: Tier | null;
};

const RESULT_LIMIT = 100;

/**
 * Listings matching the dashboard's filter bar (issue #26): tier, status,
 * triage, and source, each optional and independently combinable. Tier
 * lives on `scores`, not `listings`, so it's resolved the same way
 * `tier-summary.ts` does — each listing's most recently created score — via
 * a left join, so listings with no score yet (tier filter unset) still show
 * up under status/triage/source filters instead of silently vanishing.
 */
export async function getFilteredListings(
  db: ReturnType<typeof getDb>,
  filters: DashboardFilters,
): Promise<FilteredListing[]> {
  const latestScorePerListing = db
    .select({
      listingId: scores.listingId,
      tier: scores.tier,
      rowNumber: sql<number>`row_number() over (
        partition by ${scores.listingId}
        order by ${scores.createdAt} desc, ${scores.id} desc
      )`.as("row_number"),
    })
    .from(scores)
    .as("latest_score_per_listing");

  const conditions = [
    filters.status ? eq(listings.status, filters.status) : undefined,
    filters.triage ? eq(listings.triage, filters.triage) : undefined,
    filters.source ? eq(listings.source, filters.source) : undefined,
    filters.tier ? eq(latestScorePerListing.tier, filters.tier) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== undefined);

  const rows = await db
    .select({
      listingId: listings.id,
      title: listings.title,
      companyName: companies.name,
      status: listings.status,
      triage: listings.triage,
      source: listings.source,
      tier: latestScorePerListing.tier,
    })
    .from(listings)
    .innerJoin(companies, eq(companies.id, listings.companyId))
    .leftJoin(
      latestScorePerListing,
      and(eq(latestScorePerListing.listingId, listings.id), eq(latestScorePerListing.rowNumber, 1)),
    )
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(listings.lastSeenAt))
    .limit(RESULT_LIMIT);

  return rows.map((row) => ({ ...row, tier: row.tier ?? null }));
}
