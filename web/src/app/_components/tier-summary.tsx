import type { TierSummary } from "@/db/queries/tier-summary";
import type { Tier } from "@/db/schema/unions";

// Color tokens carried over from the legacy dashboard this replaces —
// deliberately literal hex (not Tailwind theme colors) so they match that
// tool exactly. See issue #25.
const TIER_META: Record<Tier, { label: string; fg: string; dim: string }> = {
  act: { label: "Act", fg: "var(--act)", dim: "var(--act-dim)" },
  consider: { label: "Consider", fg: "var(--consider)", dim: "var(--consider-dim)" },
  skip: { label: "Skip", fg: "var(--skip)", dim: "var(--skip-dim)" },
};

const TIER_ORDER: Tier[] = ["act", "consider", "skip"];

function formatDelta(delta: number): string {
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : String(delta);
}

export function TierSummaryPanel({ summary }: { summary: TierSummary }) {
  return (
    <section
      aria-label="Tier summary"
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      {TIER_ORDER.map((tier) => {
        const meta = TIER_META[tier];
        const count = summary.counts[tier];
        const delta = summary.deltas[tier];
        return (
          <div
            key={tier}
            className="rounded-lg border p-4"
            style={{
              backgroundColor: meta.dim,
              borderColor: meta.fg,
              color: "var(--paper)",
            }}
          >
            <div
              className="text-xs font-semibold tracking-wide uppercase"
              style={{ color: meta.fg }}
            >
              {meta.label}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-bold" style={{ color: "var(--paper)" }}>
                {count}
              </span>
              {summary.previousRunId !== null && (
                <span
                  className="text-sm font-medium"
                  style={{ color: delta === 0 ? "var(--paper-dim)" : meta.fg }}
                >
                  {formatDelta(delta)} since last run
                </span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
