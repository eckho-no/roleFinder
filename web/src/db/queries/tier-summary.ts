import { desc, eq, isNotNull, lte, sql } from "drizzle-orm";
import type { getDb } from "../client";
import { runs, scores } from "../schema";
import { tierValues, type Tier } from "../schema/unions";

export type TierCounts = Record<Tier, number>;

export type TierSummary = {
  counts: TierCounts;
  /** Signed change since the previous run — positive means the tier grew. */
  deltas: TierCounts;
  /**
   * `null` when there's no second-most-recent run to diff against (e.g. a
   * fresh board with 0 or 1 runs) — the dashboard should render counts with
   * no delta rather than a misleading "+N" against nothing.
   */
  previousRunId: number | null;
};

function zeroCounts(): TierCounts {
  return { act: 0, consider: 0, skip: 0 };
}

function toCounts(rows: { tier: string; count: number }[]): TierCounts {
  const counts = zeroCounts();
  for (const row of rows) {
    if ((tierValues as readonly string[]).includes(row.tier)) {
      counts[row.tier as Tier] = row.count;
    }
  }
  return counts;
}

/**
 * Current tier distribution: one row per listing, taken from that listing's
 * most recently created score (ties broken by the highest score id). This
 * intentionally trusts `createdAt`/`id` ordering over `supersededBy` — the
 * latter is bookkeeping on the superseded row, not a guaranteed pointer
 * chain to "the" current score, so re-deriving "latest" from ordering is
 * more robust to any gaps in that bookkeeping.
 */
async function currentTierCounts(db: ReturnType<typeof getDb>): Promise<TierCounts> {
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

  const rows = await db
    .select({
      tier: latestScorePerListing.tier,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(latestScorePerListing)
    .where(eq(latestScorePerListing.rowNumber, 1))
    .groupBy(latestScorePerListing.tier);

  return toCounts(rows);
}

/**
 * Tier distribution "as of" a point in time: same latest-score-per-listing
 * logic, but only considering scores created at or before `asOf`. A listing
 * with no qualifying score yet (nothing scored before that run completed)
 * simply doesn't contribute to any tier, matching how the current-count
 * query only counts listings that have been scored at all.
 */
async function tierCountsAsOf(
  db: ReturnType<typeof getDb>,
  asOf: Date,
): Promise<TierCounts> {
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
    .where(lte(scores.createdAt, asOf))
    .as("latest_score_per_listing_as_of");

  const rows = await db
    .select({
      tier: latestScorePerListing.tier,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(latestScorePerListing)
    .where(eq(latestScorePerListing.rowNumber, 1))
    .groupBy(latestScorePerListing.tier);

  return toCounts(rows);
}

/**
 * The second-most-recent run by `startedAt`, i.e. "the previous run" from
 * the current run's perspective. Only completed runs qualify — a run still
 * in flight (`completedAt` null) has no stable snapshot to diff against.
 */
async function previousRun(
  db: ReturnType<typeof getDb>,
): Promise<{ id: number; completedAt: Date } | null> {
  const rows = await db
    .select({ id: runs.id, completedAt: runs.completedAt })
    .from(runs)
    .where(isNotNull(runs.completedAt))
    .orderBy(desc(runs.startedAt))
    .limit(2);

  const previous = rows[1];
  if (!previous || !previous.completedAt) return null;
  return { id: previous.id, completedAt: previous.completedAt };
}

/**
 * Act/Consider/Skip counts plus the change in each since the previous run.
 * "Previous run" is the second-most-recent row in `runs` (ordered by
 * `startedAt`); the delta compares current per-tier counts against what
 * they would have been using only scores that existed by that run's
 * `completedAt`. `runs.stats` was considered as a shortcut (it already
 * holds a JSON snapshot per run) but the only key seed data populates there
 * is `newListings` — there's no tier-count snapshot to read, so this derives
 * the "as of" distribution from `scores.createdAt` instead of relying on a
 * shape that isn't actually written anywhere yet.
 */
export async function getTierSummary(db: ReturnType<typeof getDb>): Promise<TierSummary> {
  const [current, previous] = await Promise.all([currentTierCounts(db), previousRun(db)]);

  if (!previous) {
    return { counts: current, deltas: zeroCounts(), previousRunId: null };
  }

  const asOf = await tierCountsAsOf(db, previous.completedAt);
  const deltas = zeroCounts();
  for (const tier of tierValues) {
    deltas[tier] = current[tier] - asOf[tier];
  }

  return { counts: current, deltas, previousRunId: previous.id };
}
