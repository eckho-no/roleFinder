"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { outcomeValues } from "@/db/schema/unions";
import type { Outcome } from "@/db/schema/unions";
import { OUTCOME_LABELS } from "@/lib/listings/format";

/**
 * Demo sessions get this rendered disabled (not omitted) — the acceptance
 * criteria wants the outcome setter visible on the page, and a disabled
 * control with an explanatory label is a clearer signal for a read-only
 * demo than the control silently vanishing. The route handler enforces the
 * read-only rule regardless (`requireWritableSession`), so this is a UX
 * choice, not the security boundary.
 */
export function OutcomeSetter({
  listingId,
  currentOutcome,
  readOnly,
}: {
  listingId: number;
  currentOutcome: Outcome;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(currentOutcome);

  function handleChange(next: Outcome) {
    setError(null);
    const previous = outcome;
    setOutcome(next);
    startTransition(async () => {
      try {
        const response = await fetch(`/api/listings/${listingId}/outcome`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outcome: next }),
        });
        if (!response.ok) {
          setOutcome(previous);
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error === "read_only_session" ? "Demo sessions can't set an outcome." : "Couldn't save outcome.");
          return;
        }
        router.refresh();
      } catch {
        setOutcome(previous);
        setError("Couldn't save outcome.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="outcome-select" className="text-sm font-medium text-[var(--paper-dim)]">
        Outcome
      </label>
      <select
        id="outcome-select"
        className="h-11 rounded border border-[var(--paper-dim)] bg-transparent px-3 py-2 text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-50"
        value={outcome}
        disabled={readOnly || isPending}
        onChange={(event) => handleChange(event.target.value as Outcome)}
      >
        {outcomeValues.map((value) => (
          <option key={value} value={value} className="bg-[var(--ink)]">
            {OUTCOME_LABELS[value]}
          </option>
        ))}
      </select>
      {readOnly && (
        <p className="text-xs text-[var(--paper-dim)]">
          Demo mode is read-only — outcomes can&apos;t be changed here.
        </p>
      )}
      {error && <p className="text-xs text-[var(--skip)]">{error}</p>}
    </div>
  );
}
