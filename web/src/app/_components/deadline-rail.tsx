import Link from "next/link";

import type { DeadlineRailEntry } from "@/db/queries/deadline-rail";

function formatDaysLeft(expiresAt: Date, now: Date): string {
  const msLeft = expiresAt.getTime() - now.getTime();
  const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));
  if (daysLeft <= 0) return "today";
  if (daysLeft === 1) return "1 day";
  return `${daysLeft} days`;
}

function DeadlineSourceBadge({ source }: { source: DeadlineRailEntry["deadlineSource"] }) {
  // "stated" (the listing itself gives a deadline) is trustworthy — shown in
  // the ordinary paper tone. "inferred" (we guessed it, e.g. from posting
  // age) is flagged with the muted "stale" token so it visually reads as
  // lower-confidence, per issue #24's "visually distinguishes stated vs
  // inferred deadlines" criterion. "none" shouldn't reach this component at
  // all (the query only returns rows with a non-null expiresAt), but is
  // handled defensively rather than assumed away.
  if (source === "stated") {
    return (
      <span
        className="rounded px-1.5 py-0.5 text-xs font-medium"
        style={{ color: "var(--paper)", border: "1px solid var(--paper-dim)" }}
      >
        stated
      </span>
    );
  }

  return (
    <span
      className="rounded px-1.5 py-0.5 text-xs font-medium italic"
      style={{ color: "var(--stale)", border: "1px dashed var(--stale)" }}
      title="Deadline inferred, not stated by the listing"
    >
      inferred
    </span>
  );
}

export function DeadlineRail({
  entries,
  now = new Date(),
}: {
  entries: DeadlineRailEntry[];
  now?: Date;
}) {
  return (
    <section
      aria-label="Deadlines within 14 days"
      className="rounded-lg border p-4"
      style={{ borderColor: "var(--paper-dim)" }}
    >
      <h2
        className="text-xs font-semibold tracking-wide uppercase"
        style={{ color: "var(--paper-dim)" }}
      >
        Closing soon
      </h2>

      {entries.length === 0 ? (
        <p className="mt-2 text-sm" style={{ color: "var(--paper-dim)" }}>
          Nothing closing in the next 14 days.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y" style={{ borderColor: "var(--paper-dim)" }}>
          {entries.map((entry) => (
            <li key={entry.listingId} style={{ borderColor: "var(--paper-dim)" }}>
              <Link
                href={`/listings/${entry.listingId}`}
                className="flex min-h-11 items-center justify-between gap-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span
                    className="truncate text-sm font-medium"
                    style={{ color: "var(--paper)" }}
                  >
                    {entry.title}
                  </span>
                  <span className="truncate text-xs" style={{ color: "var(--paper-dim)" }}>
                    {entry.companyName}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <DeadlineSourceBadge source={entry.deadlineSource} />
                  <span className="text-sm font-semibold" style={{ color: "var(--paper)" }}>
                    {formatDaysLeft(entry.expiresAt, now)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
