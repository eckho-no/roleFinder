import type { FilteredListing } from "@/db/queries/filtered-listings";
import type { Tier } from "@/db/schema/unions";

const TIER_COLOR: Record<Tier, string> = {
  act: "var(--act)",
  consider: "var(--consider)",
  skip: "var(--skip)",
};

export function FilteredListingsPanel({ listings }: { listings: FilteredListing[] }) {
  return (
    <section aria-label="Filtered listings" className="flex flex-col gap-2">
      {listings.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--paper-dim)" }}>
          No listings match these filters.
        </p>
      ) : (
        <ul className="flex flex-col divide-y" style={{ borderColor: "var(--paper-dim)" }}>
          {listings.map((listing) => (
            <li
              key={listing.listingId}
              className="flex items-center justify-between gap-3 py-2"
              style={{ borderColor: "var(--paper-dim)" }}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium" style={{ color: "var(--paper)" }}>
                  {listing.title}
                </span>
                <span className="truncate text-xs" style={{ color: "var(--paper-dim)" }}>
                  {listing.companyName} · {listing.status} · {listing.triage.replace(/_/g, " ")} ·{" "}
                  {listing.source}
                </span>
              </div>
              {listing.tier && (
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold uppercase"
                  style={{ color: TIER_COLOR[listing.tier], border: `1px solid ${TIER_COLOR[listing.tier]}` }}
                >
                  {listing.tier}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
