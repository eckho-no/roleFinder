import type { Outcome, Tier } from "@/db/schema/unions";

/** Tailwind text/background classes keyed off the tier tokens in the design brief. */
export const TIER_CLASSES: Record<Tier, string> = {
  act: "text-[var(--act)] border-[var(--act-dim)] bg-[var(--act-dim)]",
  consider: "text-[var(--consider)] border-[var(--consider-dim)] bg-[var(--consider-dim)]",
  skip: "text-[var(--skip)] border-[var(--skip-dim)] bg-[var(--skip-dim)]",
};

/** Status doesn't have its own token set — `stale` covers anything not live. */
export const STATUS_CLASSES: Record<string, string> = {
  live: "text-[var(--act)] border-[var(--act-dim)] bg-[var(--act-dim)]",
  closed: "text-[var(--stale)] border-[var(--paper-dim)] bg-transparent",
  expired: "text-[var(--stale)] border-[var(--paper-dim)] bg-transparent",
  unknown: "text-[var(--paper-dim)] border-[var(--paper-dim)] bg-transparent",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  none: "No outcome yet",
  applied: "Applied",
  responded: "Responded",
  interviewed: "Interviewed",
  offered: "Offered",
  rejected: "Rejected",
  ghosted: "Ghosted",
};

export function formatDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function formatSalary(listing: {
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryStated: boolean;
}): string {
  if (!listing.salaryStated || (listing.salaryMin == null && listing.salaryMax == null)) {
    return "Not stated";
  }
  const currency = listing.salaryCurrency ?? "";
  const period = listing.salaryPeriod ? `/${listing.salaryPeriod}` : "";
  const fmt = (n: number) => n.toLocaleString("en-GB");
  if (listing.salaryMin != null && listing.salaryMax != null) {
    return `${currency}${fmt(listing.salaryMin)}–${currency}${fmt(listing.salaryMax)}${period}`;
  }
  const single = listing.salaryMin ?? listing.salaryMax;
  return single != null ? `${currency}${fmt(single)}${period}` : "Not stated";
}
