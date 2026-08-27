import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getDb } from "@/db/client";
import { companies, listings, sightings } from "@/db/schema/core";
import { notes, profileConfig, scores } from "@/db/schema/scoring";
import type { ProfileAxis } from "@/db/schema/scoring";
import { databaseForSession } from "@/lib/auth/database-for-session";
import { requireSessionForPage } from "@/lib/auth/session-for-page";
import { OutcomeSetter } from "@/components/listings/outcome-setter";
import {
  STATUS_CLASSES,
  TIER_CLASSES,
  formatDate,
  formatDateTime,
  formatSalary,
} from "@/lib/listings/format";

export const dynamic = "force-dynamic";

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide ${className}`}>
      {label}
    </span>
  );
}

export default async function ListingDetailPage(
  props: PageProps<"/listings/[id]">,
) {
  const { id } = await props.params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId <= 0) {
    notFound();
  }

  const session = await requireSessionForPage();
  const { env } = await getCloudflareContext({ async: true });
  const db = getDb(databaseForSession(session, env));

  const [listing] = await db
    .select({ listing: listings, company: companies })
    .from(listings)
    .innerJoin(companies, eq(listings.companyId, companies.id))
    .where(eq(listings.id, listingId))
    .limit(1);

  if (!listing) {
    notFound();
  }

  const [currentConfig] = await db
    .select()
    .from(profileConfig)
    .where(eq(profileConfig.isCurrent, true))
    .limit(1);
  const axisLabels = new Map<string, ProfileAxis>(
    (currentConfig?.axes ?? []).map((axis) => [axis.id, axis]),
  );

  const [scoreRows, noteRows, sightingRows] = await Promise.all([
    db
      .select()
      .from(scores)
      .where(eq(scores.listingId, listingId))
      .orderBy(desc(scores.createdAt)),
    db
      .select()
      .from(notes)
      .where(eq(notes.listingId, listingId))
      .orderBy(desc(notes.createdAt)),
    db
      .select()
      .from(sightings)
      .where(eq(sightings.listingId, listingId))
      .orderBy(desc(sightings.seenAt)),
  ]);

  // A listing can accumulate several score rows over time (re-scoring is
  // M5, but manual scores can already chain via `supersededBy`). The
  // non-superseded row is "current" — shown in full up top. Anything else
  // is history, collapsed below so the acceptance criteria's "rationale"
  // reads against the score that's actually in effect, not an old one.
  const currentScore = scoreRows.find((row) => row.supersededBy === null) ?? scoreRows[0];
  const scoreHistory = scoreRows.filter((row) => row.id !== currentScore?.id);

  const { listing: row, company } = listing;
  const isReadOnly = session.role === "demo";

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 bg-[var(--ink)] p-8 text-[var(--paper)]">
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="flex min-h-11 w-fit items-center text-sm text-[var(--paper-dim)] hover:underline"
        >
          ← Back to dashboard
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{row.title}</h1>
            <p className="text-[var(--paper-dim)]">{company.name}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {currentScore && (
              <Badge label={currentScore.tier} className={TIER_CLASSES[currentScore.tier]} />
            )}
            <Badge
              label={row.status}
              className={STATUS_CLASSES[row.status] ?? STATUS_CLASSES.unknown}
            />
            <Badge
              label={row.triage.replaceAll("_", " ")}
              className="border-[var(--paper-dim)] bg-transparent text-[var(--paper-dim)]"
            />
          </div>
        </div>
      </div>

      {/* Fields */}
      <section className="grid grid-cols-1 gap-4 rounded border border-[var(--paper-dim)] p-4 sm:grid-cols-2">
        <Field label="Location" value={row.location ?? "—"} />
        <Field label="Remote type" value={row.remoteType} />
        <Field label="Salary" value={formatSalary(row)} />
        <Field label="Source" value={row.source} />
        <Field label="Link type" value={row.linkType} />
        <Field
          label="URL"
          value={
            row.url ? (
              <a
                href={row.url}
                target="_blank"
                rel="noreferrer"
                className="-mx-1 -my-2.5 inline-flex min-h-11 items-center break-all px-1 py-2.5 text-[var(--act)] hover:underline"
              >
                {row.url}
              </a>
            ) : (
              "—"
            )
          }
        />
        <Field label="Posted" value={formatDate(row.postedDate)} />
        <Field
          label="Deadline"
          value={`${formatDate(row.expiresAt)} (${row.deadlineSource})`}
        />
        <Field label="First seen" value={formatDateTime(row.firstSeenAt)} />
        <Field label="Last seen" value={formatDateTime(row.lastSeenAt)} />
        <Field label="Sighting count" value={String(row.sightingCount)} />
        <Field label="Status confirmed" value={formatDateTime(row.statusConfirmedAt)} />
      </section>

      {/* Outcome setter */}
      <section className="rounded border border-[var(--paper-dim)] p-4">
        <OutcomeSetter listingId={row.id} currentOutcome={row.outcome} readOnly={isReadOnly} />
        {row.outcomeAt && (
          <p className="mt-2 text-xs text-[var(--paper-dim)]">
            Last changed {formatDateTime(row.outcomeAt)}
          </p>
        )}
      </section>

      {/* Score breakdown */}
      <section className="flex flex-col gap-3 rounded border border-[var(--paper-dim)] p-4">
        <h2 className="text-lg font-semibold">Score breakdown</h2>
        {currentScore ? (
          <>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold">{currentScore.total}</span>
              <Badge label={currentScore.tier} className={TIER_CLASSES[currentScore.tier]} />
              <span className="text-xs text-[var(--paper-dim)]">
                scored by {currentScore.scoredBy}
                {currentScore.confidence != null &&
                  ` · confidence ${Math.round(currentScore.confidence * 100)}%`}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {Object.entries(currentScore.axes).map(([axisId, value]) => {
                const axis = axisLabels.get(axisId);
                return (
                  <li key={axisId} className="flex items-center justify-between gap-4">
                    <span title={axis?.description}>{axis?.label ?? axisId}</span>
                    <span className="text-[var(--paper-dim)]">
                      {value}
                      {axis?.max != null ? ` / ${axis.max}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
            {currentScore.rationale && (
              <p className="whitespace-pre-wrap text-sm text-[var(--paper-dim)]">
                {currentScore.rationale}
              </p>
            )}
            <p className="text-xs text-[var(--paper-dim)]">
              Scored {formatDateTime(currentScore.createdAt)}
            </p>
          </>
        ) : (
          <p className="text-sm text-[var(--paper-dim)]">Not scored yet.</p>
        )}

        {scoreHistory.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-[var(--paper-dim)]">
              {scoreHistory.length} earlier score{scoreHistory.length === 1 ? "" : "s"}
            </summary>
            <ul className="mt-2 flex flex-col gap-2">
              {scoreHistory.map((entry) => (
                <li key={entry.id} className="border-t border-[var(--paper-dim)] pt-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{entry.total}</span>
                    <Badge label={entry.tier} className={TIER_CLASSES[entry.tier]} />
                    <span className="text-xs text-[var(--paper-dim)]">
                      {formatDateTime(entry.createdAt)} · {entry.scoredBy}
                    </span>
                  </div>
                  {entry.rationale && (
                    <p className="mt-1 whitespace-pre-wrap text-[var(--paper-dim)]">
                      {entry.rationale}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Notes timeline */}
      <section className="flex flex-col gap-3 rounded border border-[var(--paper-dim)] p-4">
        <h2 className="text-lg font-semibold">Notes</h2>
        {noteRows.length === 0 ? (
          <p className="text-sm text-[var(--paper-dim)]">No notes yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {noteRows.map((note) => (
              <li key={note.id} className="border-t border-[var(--paper-dim)] pt-3 first:border-t-0 first:pt-0">
                <div className="flex items-center gap-2 text-xs text-[var(--paper-dim)]">
                  <span className="font-medium uppercase tracking-wide">
                    {note.type.replaceAll("_", " ")}
                  </span>
                  <span>·</span>
                  <span>{formatDateTime(note.createdAt)}</span>
                  <span>·</span>
                  <span>{note.createdBy}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{note.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sighting history */}
      <section className="flex flex-col gap-3 rounded border border-[var(--paper-dim)] p-4">
        <h2 className="text-lg font-semibold">Sighting history</h2>
        {sightingRows.length === 0 ? (
          <p className="text-sm text-[var(--paper-dim)]">No sightings recorded.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sightingRows.map((sighting) => (
              <li key={sighting.id} className="flex flex-col gap-1 border-t border-[var(--paper-dim)] pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center gap-2 text-xs text-[var(--paper-dim)]">
                  <span className="font-medium uppercase tracking-wide">{sighting.source}</span>
                  <span>·</span>
                  <span>{formatDateTime(sighting.seenAt)}</span>
                </div>
                {sighting.rawSnippet && (
                  <p className="text-sm text-[var(--paper-dim)]">{sighting.rawSnippet}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-[var(--paper-dim)]">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
