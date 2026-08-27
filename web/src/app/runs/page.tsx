import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc } from "drizzle-orm";

import { requireSessionForPage } from "@/lib/auth/session-for-page";
import { databaseForSession } from "@/lib/auth/database-for-session";
import { getDb } from "@/db/client";
import { runs } from "@/db/schema";
import type { RunKind } from "@/db/schema/unions";

export const dynamic = "force-dynamic";

// Keyed by `RunKind` (unions.ts, backed by `runKindValues`) so this stays
// exhaustive at compile time — a new run kind is a type error here, not a
// silent fallthrough at render time.
const KIND_LABEL: Record<RunKind, string> = {
  full: "Full",
  sweep: "Sweep",
  manual: "Manual",
  cron: "Cron",
};

function formatDuration(startedAt: Date, completedAt: Date | null): string {
  if (!completedAt) return "in progress";
  const ms = completedAt.getTime() - startedAt.getTime();
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export default async function RunsPage() {
  const session = await requireSessionForPage();
  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(databaseForSession(session, env));

  const allRuns = await db.select().from(runs).orderBy(desc(runs.startedAt));

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold text-[var(--ink)]">Runs</h1>

      {allRuns.length === 0 ? (
        <p className="text-sm text-[var(--paper-dim)]">No runs recorded yet.</p>
      ) : (
        <div className="min-w-0 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--paper-dim)]/30 text-left text-[var(--paper-dim)]">
                <th className="py-2 pr-4 font-medium">Run</th>
                <th className="py-2 pr-4 font-medium">Kind</th>
                <th className="py-2 pr-4 font-medium">Started</th>
                <th className="py-2 pr-4 font-medium">Duration</th>
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {allRuns.map((run) => (
                <tr key={run.id} className="border-b border-[var(--paper-dim)]/10 align-top">
                  <td className="py-2 pr-4 font-medium text-[var(--ink)]">
                    #{run.runNumber}
                    {run.label && (
                      <span className="ml-2 font-normal text-[var(--paper-dim)]">{run.label}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-[var(--ink)]">
                    {KIND_LABEL[run.kind] ?? run.kind}
                  </td>
                  <td className="py-2 pr-4 text-[var(--paper-dim)]">
                    {run.startedAt.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-[var(--paper-dim)]">
                    {formatDuration(run.startedAt, run.completedAt)}
                  </td>
                  <td className="py-2 pr-4 text-[var(--paper-dim)]">{run.source ?? "—"}</td>
                  <td className="py-2 text-[var(--ink)]">{run.summary ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
