import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

import * as schema from "@/db/schema";
import { profileConfig } from "@/db/schema/scoring";
import { FakeD1Database } from "@/db/test-d1";
import {
  ProfileConfigConflictError,
  writeProfileConfigVersion,
  type ProfileConfigInput,
} from "./write-profile-config";

const PROFILE_CONFIG_DDL = `
CREATE TABLE profile_config (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  version integer NOT NULL,
  is_current integer DEFAULT false NOT NULL,
  titles text NOT NULL,
  location_rules text NOT NULL,
  salary_floor integer NOT NULL,
  salary_hard_floor integer NOT NULL,
  positioning text NOT NULL,
  axes text NOT NULL,
  tier_thresholds text NOT NULL,
  created_at integer NOT NULL,
  created_by text,
  note text
);
CREATE INDEX profile_config_is_current_idx ON profile_config (is_current);
`;

function testDb() {
  const fakeD1 = new FakeD1Database(PROFILE_CONFIG_DDL);
  // drizzle-orm/d1's own D1Database type is workers-runtime-shaped; the fake
  // only implements the subset (`prepare`/`batch`) the driver actually
  // calls, so it's cast rather than fully satisfying the ambient type.
  return drizzle(fakeD1 as unknown as D1Database, { schema });
}

function baseInput(overrides: Partial<ProfileConfigInput> = {}): ProfileConfigInput {
  return {
    titles: ["Staff Engineer"],
    locationRules: {
      commutable: ["London"],
      notCommutable: [],
      radiusMiles: 25,
      londonRule: "zone-1-3",
    },
    salaryFloor: 90000,
    salaryHardFloor: 80000,
    positioning: { blurb: "v1" },
    axes: [{ id: "impact", label: "Impact", description: "d", max: 10, weight: 1 }],
    tierThresholds: { act: 8, consider: 5 },
    createdBy: "david",
    note: "initial",
    ...overrides,
  };
}

describe("writeProfileConfigVersion", () => {
  it("inserts version 1 as current when the table is empty", async () => {
    const db = testDb();

    const result = await writeProfileConfigVersion(db, baseInput());

    expect(result.version).toBe(1);
    const rows = await db.select().from(profileConfig);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: 1, isCurrent: true });
  });

  it("writes a new row for the second save rather than mutating the first", async () => {
    const db = testDb();
    const first = await writeProfileConfigVersion(db, baseInput({ note: "v1" }));

    const second = await writeProfileConfigVersion(db, baseInput({ note: "v2" }));

    expect(second.version).toBe(2);
    expect(second.id).not.toBe(first.id);

    const rows = await db.select().from(profileConfig).orderBy(profileConfig.id);
    expect(rows).toHaveLength(2);
    // The first row's content is untouched — only isCurrent flipped.
    expect(rows[0]).toMatchObject({ id: first.id, version: 1, note: "v1", isCurrent: false });
    expect(rows[1]).toMatchObject({ id: second.id, version: 2, note: "v2", isCurrent: true });
  });

  it("only ever has exactly one isCurrent row after several saves", async () => {
    const db = testDb();

    for (let i = 0; i < 5; i++) {
      await writeProfileConfigVersion(db, baseInput({ note: `v${i}` }));
    }

    const rows = await db.select().from(profileConfig);
    const current = rows.filter((r) => r.isCurrent);
    expect(current).toHaveLength(1);
    expect(current[0].version).toBe(5);
  });

  it("preserves the full field set on the new row, including JSON columns", async () => {
    const db = testDb();
    const input = baseInput({
      titles: ["Staff Engineer", "Principal Engineer"],
      axes: [
        { id: "impact", label: "Impact", description: "d", max: 10, weight: 1 },
        { id: "scope", label: "Scope", description: "d2", max: 5, weight: 0.5 },
      ],
    });

    await writeProfileConfigVersion(db, input);

    const [row] = await db.select().from(profileConfig);
    expect(row.titles).toEqual(input.titles);
    expect(row.axes).toEqual(input.axes);
    expect(row.locationRules).toEqual(input.locationRules);
    expect(row.tierThresholds).toEqual(input.tierThresholds);
  });

  it("repairs and throws ProfileConfigConflictError if the current row changed concurrently", async () => {
    const db = testDb();
    const first = await writeProfileConfigVersion(db, baseInput({ note: "v1" }));

    // Simulate a second writer's batch landing in the gap between this
    // call's SELECT (already done, above) and its own batch: wrap `batch`
    // so the *first* time writeProfileConfigVersion invokes it, we demote
    // the row out of band first, then let the real batch run against that
    // now-stale state — reproducing exactly the interleaving the demote
    // guard (`isCurrent = true` in the WHERE clause) exists to catch.
    const originalBatch = db.batch.bind(db);
    const batchSpy = async (...args: Parameters<typeof db.batch>) => {
      await db
        .update(profileConfig)
        .set({ isCurrent: false })
        .where(eq(profileConfig.id, first.id));
      return originalBatch(...args);
    };
    db.batch = batchSpy as unknown as typeof db.batch;

    await expect(writeProfileConfigVersion(db, baseInput({ note: "v2" }))).rejects.toBeInstanceOf(
      ProfileConfigConflictError,
    );

    // No orphaned isCurrent row from the failed attempt, and the row this
    // call tried (and failed) to insert was cleaned up rather than left
    // behind as an untracked extra version.
    const rows = await db.select().from(profileConfig);
    expect(rows.filter((r) => r.isCurrent)).toHaveLength(0);
    expect(rows.map((r) => r.note)).toEqual(["v1"]);
  });
});
