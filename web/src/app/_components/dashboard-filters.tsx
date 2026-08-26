"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { listingStatusValues, sourceValues, tierValues, triageValues } from "@/db/schema/unions";

// Labels for the filter select options. `logged_only` gets a label that
// spells out what it means (issue #26 calls out that it's the largest
// triage category, so it needs to be easy to find and unambiguous, not just
// technically present in the <select>).
const TRIAGE_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  scored: "Scored",
  logged_only: "Logged only",
  rejected: "Rejected",
  merged: "Merged",
};

const FILTER_KEYS = ["tier", "status", "triage", "source"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const FILTER_OPTIONS: Record<FilterKey, readonly string[]> = {
  tier: tierValues,
  status: listingStatusValues,
  triage: triageValues,
  source: sourceValues,
};

function labelFor(key: FilterKey, value: string): string {
  if (key === "triage" && value in TRIAGE_LABELS) return TRIAGE_LABELS[value];
  return value.replace(/_/g, " ");
}

/**
 * Filter controls for the dashboard, backed entirely by URL search params
 * (`?tier=act&triage=logged_only&...`) so a filtered view is shareable and
 * bookmarkable per issue #26 — there's no component state duplicating what
 * the URL already holds. `router.replace` (not `push`) so cycling through
 * filters doesn't spam the browser history stack with one entry per click.
 */
export function DashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setFilter(key: FilterKey, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  const hasAnyFilter = FILTER_KEYS.some((key) => searchParams.get(key));

  return (
    <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Dashboard filters">
      {FILTER_KEYS.map((key) => (
        <label key={key} className="flex flex-col gap-1 text-xs" style={{ color: "var(--paper-dim)" }}>
          <span className="uppercase tracking-wide">{key}</span>
          <select
            className="rounded border bg-transparent px-2 py-1 text-sm"
            style={{ borderColor: "var(--paper-dim)", color: "var(--paper)" }}
            value={searchParams.get(key) ?? ""}
            onChange={(event) => setFilter(key, event.target.value)}
            aria-label={`Filter by ${key}`}
          >
            <option value="">All</option>
            {FILTER_OPTIONS[key].map((value) => (
              <option key={value} value={value}>
                {labelFor(key, value)}
              </option>
            ))}
          </select>
        </label>
      ))}

      {hasAnyFilter && (
        <button
          type="button"
          className="mt-4 text-xs underline"
          style={{ color: "var(--paper-dim)" }}
          onClick={() => router.replace(pathname)}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
