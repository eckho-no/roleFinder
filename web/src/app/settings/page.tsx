import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc } from "drizzle-orm";

import { requireSessionForPage } from "@/lib/auth/session-for-page";
import { databaseForSession } from "@/lib/auth/database-for-session";
import { getDb } from "@/db/client";
import { profileConfig } from "@/db/schema/scoring";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSessionForPage();
  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(databaseForSession(session, env));

  const history = await db
    .select()
    .from(profileConfig)
    .orderBy(desc(profileConfig.version));
  const current = history.find((row) => row.isCurrent) ?? null;

  // Demo sessions are read-only end to end (see requireWritableSession in
  // require-session.ts, which POST /api/settings enforces server-side
  // regardless of what this renders) — the form is hidden rather than shown
  // disabled, so there's no disabled-but-visible control implying a demo
  // user could edit it if they found the right button. The version history
  // is still fully visible; it's read data, not a write surface.
  const isReadOnly = session.role === "demo";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-[var(--ink)]">Settings</h1>
        <p className="text-sm text-[var(--paper-dim)]">
          Editing <code>profile_config</code> writes a new version — nothing is overwritten in
          place.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded border border-[var(--paper-dim)]/30 p-4">
        <h2 className="text-sm font-medium text-[var(--paper-dim)]">Current version</h2>
        {current ? (
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-semibold text-[var(--act)]">v{current.version}</span>
            <span className="text-sm text-[var(--paper-dim)]">
              since {current.createdAt.toLocaleString()}
              {current.createdBy ? ` · by ${current.createdBy}` : ""}
            </span>
          </div>
        ) : (
          <p className="text-sm text-[var(--paper-dim)]">No config saved yet.</p>
        )}
        {current?.note && <p className="text-sm text-[var(--ink)]">{current.note}</p>}
      </div>

      {isReadOnly ? (
        <p className="rounded border border-[var(--paper-dim)]/30 p-4 text-sm text-[var(--paper-dim)]">
          Demo sessions are read-only — the edit form is unavailable. Sign in with the real
          password to change scoring configuration.
        </p>
      ) : (
        <SettingsForm currentConfig={current} />
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-[var(--ink)]">Version history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-[var(--paper-dim)]">No versions yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-[var(--paper-dim)]/20 text-sm">
            {history.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span
                    className={
                      row.isCurrent
                        ? "font-semibold text-[var(--act)]"
                        : "font-medium text-[var(--ink)]"
                    }
                  >
                    v{row.version}
                  </span>
                  {row.isCurrent && (
                    <span className="rounded bg-[var(--act-dim)] px-1.5 py-0.5 text-xs text-[var(--act)]">
                      current
                    </span>
                  )}
                  {row.note && <span className="text-[var(--paper-dim)]">{row.note}</span>}
                </div>
                <span className="text-xs text-[var(--paper-dim)]">
                  {row.createdAt.toLocaleString()}
                  {row.createdBy ? ` · ${row.createdBy}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
