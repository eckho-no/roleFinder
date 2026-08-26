import { and, eq } from "drizzle-orm";

import type { getDb } from "@/db/client";
import { profileConfig, type LocationRules, type ProfileAxis } from "@/db/schema/scoring";

/** Thrown when another writer flipped `isCurrent` between our read and our write. */
export class ProfileConfigConflictError extends Error {
  constructor() {
    super("profile_config was updated concurrently — reload and retry");
  }
}

export type ProfileConfigInput = {
  titles: string[];
  locationRules: LocationRules;
  salaryFloor: number;
  salaryHardFloor: number;
  positioning: Record<string, unknown>;
  axes: ProfileAxis[];
  tierThresholds: { act: number; consider: number };
  createdBy?: string | null;
  note?: string | null;
};

/**
 * Writes a new `profile_config` row rather than mutating the current one.
 *
 * `profile_config` is append-only: every save inserts `version = currentVersion
 * + 1` with `isCurrent = true`, and flips whichever row was previously
 * current to `isCurrent = false`. Nothing ever `UPDATE`s a row's content
 * columns in place — the history is the audit log, and "which version is
 * live" is just "the row where isCurrent = true" rather than a mutable
 * pointer that could drift from the data it's supposed to describe.
 *
 * The demote + insert pair goes through `db.batch`, D1's atomic-batch
 * primitive (drizzle-orm/d1's `DrizzleD1Database.batch`), so a crash
 * between the two can't leave the table in a partial state. `batch` itself
 * doesn't give us compare-and-swap semantics though — an `UPDATE` matching
 * zero rows doesn't fail the batch, it just reports zero changes — so a
 * second writer racing between our SELECT and our batch could still slip a
 * row in. We detect that (the demote's `meta.changes !== 1`) and repair it
 * by deleting the row we just inserted, rather than leaving two rows both
 * claiming `isCurrent`. This app is single-operator behind password auth,
 * so the repair path is a safety net for a freak double-submit, not a
 * high-contention scenario worth a heavier locking scheme.
 */
export async function writeProfileConfigVersion(
  db: ReturnType<typeof getDb>,
  input: ProfileConfigInput,
): Promise<{ id: number; version: number }> {
  const [currentRow] = await db
    .select({ id: profileConfig.id, version: profileConfig.version })
    .from(profileConfig)
    .where(eq(profileConfig.isCurrent, true));

  const nextVersion = (currentRow?.version ?? 0) + 1;

  const values = {
    version: nextVersion,
    isCurrent: true,
    titles: input.titles,
    locationRules: input.locationRules,
    salaryFloor: input.salaryFloor,
    salaryHardFloor: input.salaryHardFloor,
    positioning: input.positioning,
    axes: input.axes,
    tierThresholds: input.tierThresholds,
    createdBy: input.createdBy ?? null,
    note: input.note ?? null,
  };

  if (!currentRow) {
    // First-ever config: nothing to demote, and `db.batch` requires a
    // non-empty tuple, so a single insert runs directly.
    const [inserted] = await db.insert(profileConfig).values(values).returning({
      id: profileConfig.id,
      version: profileConfig.version,
    });
    return inserted;
  }

  // Guarded on `isCurrent = true` too (not just `id`), so if another writer
  // already flipped this row between our SELECT above and this batch, the
  // demote matches zero rows instead of silently "succeeding".
  const demoteOldCurrent = db
    .update(profileConfig)
    .set({ isCurrent: false })
    .where(and(eq(profileConfig.id, currentRow.id), eq(profileConfig.isCurrent, true)));
  const insertNewCurrent = db.insert(profileConfig).values(values).returning({
    id: profileConfig.id,
    version: profileConfig.version,
  });

  const [demoteResult, insertResult] = await db.batch([demoteOldCurrent, insertNewCurrent]);

  if (demoteResult.meta.changes !== 1) {
    // Lost the race: repair by removing the row we just inserted so the
    // table doesn't end up with two `isCurrent` rows or a version gap that
    // looks like a real edit.
    const [orphan] = insertResult;
    if (orphan) {
      await db.delete(profileConfig).where(eq(profileConfig.id, orphan.id));
    }
    throw new ProfileConfigConflictError();
  }

  const [inserted] = insertResult;
  if (!inserted) {
    throw new Error("profile_config write did not produce a current row");
  }
  return inserted;
}
