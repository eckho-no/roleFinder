import { getCloudflareContext } from "@opennextjs/cloudflare";

import { DeadlineRail } from "./_components/deadline-rail";
import { TierSummaryPanel } from "./_components/tier-summary";
import { databaseForSession } from "@/lib/auth/database-for-session";
import { requireSessionForPage } from "@/lib/auth/session-for-page";
import { getDb } from "@/db/client";
import { getDeadlineRail } from "@/db/queries/deadline-rail";
import { getTierSummary } from "@/db/queries/tier-summary";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Middleware has already rejected any request without a valid session by
  // the time this renders — this resolves *which* session (real vs demo) so
  // `databaseForSession` can pick the right D1 binding. See
  // `src/lib/auth/session-for-page.ts` for why this isn't `requireSession`.
  const session = await requireSessionForPage();
  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(databaseForSession(session, env));

  const [deadlineRail, tierSummary] = await Promise.all([
    getDeadlineRail(db),
    getTierSummary(db),
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
      </div>
    </div>
  );
}
