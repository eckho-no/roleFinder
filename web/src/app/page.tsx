import { getCloudflareContext } from "@opennextjs/cloudflare";

import { DashboardFilters } from "./_components/dashboard-filters";
import { DeadlineRail } from "./_components/deadline-rail";
import { FilteredListingsPanel } from "./_components/filtered-listings";
import { TierSummaryPanel } from "./_components/tier-summary";
import { databaseForSession } from "@/lib/auth/database-for-session";
import { requireSessionForPage } from "@/lib/auth/session-for-page";
import { getDb } from "@/db/client";
import { getDeadlineRail } from "@/db/queries/deadline-rail";
import { getFilteredListings, parseDashboardFilters } from "@/db/queries/filtered-listings";
import { getTierSummary } from "@/db/queries/tier-summary";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Middleware has already rejected any request without a valid session by
  // the time this renders — this resolves *which* session (real vs demo) so
  // `databaseForSession` can pick the right D1 binding. See
  // `src/lib/auth/session-for-page.ts` for why this isn't `requireSession`.
  const session = await requireSessionForPage();
  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(databaseForSession(session, env));

  const filters = parseDashboardFilters(await searchParams);

  const [deadlineRail, tierSummary, filteredListings] = await Promise.all([
    getDeadlineRail(db),
    getTierSummary(db),
    getFilteredListings(db, filters),
  ]);

  return (
    <div
      className="min-h-screen p-6 sm:p-10"
      style={{ backgroundColor: "var(--ink)", color: "var(--paper)" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        <header>
          <h1 className="text-xl font-semibold" style={{ color: "var(--paper)" }}>
            roleFinder
          </h1>
          {session.role === "demo" && (
            <p className="mt-1 text-sm" style={{ color: "var(--paper-dim)" }}>
              Demo mode — read-only synthetic board.
            </p>
          )}
        </header>

        {/* Deadline rail is the top element of the page, above tier counts
            — issue #24: "the highest-value behaviour of the tracker it
            replaces." */}
        <DeadlineRail entries={deadlineRail} />

        <TierSummaryPanel summary={tierSummary} />

        <section className="flex flex-col gap-3">
          {/* Filters are URL search params end to end — DashboardFilters
              reads/writes them client-side, this server component parses
              them from `searchParams` on every request, so a filtered view
              is shareable and bookmarkable (issue #26). */}
          <DashboardFilters />
          <FilteredListingsPanel listings={filteredListings} />
        </section>
      </div>
    </div>
  );
}
