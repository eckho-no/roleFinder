import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { getDb } from "../client";
import { companies, listings } from "../schema";
import type { DeadlineSource } from "../schema/unions";

export type DeadlineRailEntry = {
  listingId: number;
  title: string;
  companyName: string;
  expiresAt: Date;
  deadlineSource: DeadlineSource;
};

const RAIL_WINDOW_DAYS = 14;

/**
 * Listings closing soon: `expiresAt` between now and `RAIL_WINDOW_DAYS` days
 * out, ascending (soonest first). Deliberately excludes anything that has
 * already expired (`expiresAt < now`) — those belong in a "missed" view,
 * not a "closing soon" rail (see issue #24: "Two roles have already expired
 * mid-deliberation" is the problem this replaces, not one it should also
 * surface here).
 */
export async function getDeadlineRail(
  db: ReturnType<typeof getDb>,
  now: Date = new Date(),
): Promise<DeadlineRailEntry[]> {
  const windowEnd = new Date(now.getTime() + RAIL_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      listingId: listings.id,
      title: listings.title,
      companyName: companies.name,
      expiresAt: listings.expiresAt,
      deadlineSource: listings.deadlineSource,
    })
    .from(listings)
    .innerJoin(companies, eq(companies.id, listings.companyId))
    .where(
      and(
        isNotNull(listings.expiresAt),
        gte(listings.expiresAt, now),
        lte(listings.expiresAt, windowEnd),
      ),
    )
    .orderBy(asc(listings.expiresAt));

  return rows
    .filter((row): row is typeof row & { expiresAt: Date } => row.expiresAt !== null)
    .map((row) => ({
      listingId: row.listingId,
      title: row.title,
      companyName: row.companyName,
      expiresAt: row.expiresAt,
      deadlineSource: row.deadlineSource,
    }));
}
