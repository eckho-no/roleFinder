import { afterEach, describe, expect, it } from "vitest";

import { companies, listings, profileConfig, runs, scores } from "../schema";
import { createTestD1 } from "../test-d1";
import { getTierSummary } from "./tier-summary";

// Real SQLite via node:sqlite (see ../test-d1.ts's FakeD1Database) with the
// actual Drizzle migration applied — this exercises the real SQL (window
// functions) rather than mocking the query builder, since the delta logic
// here lives entirely in the SQL, not in JS glue that a mock would
// meaningfully stand in for.

async function seedBaseRow(db: Awaited<ReturnType<typeof createTestD1>>["db"]) {
  const [company] = await db
    .insert(companies)
    .values({ name: "Acme", slug: "acme" })
    .returning();
  const [config] = await db
    .insert(profileConfig)
    .values({
      version: 1,
      titles: ["Engineer"],
      locationRules: { commutable: [], notCommutable: [], radiusMiles: 0, londonRule: "" },
      salaryFloor: 0,
      salaryHardFloor: 0,
      positioning: {},
      axes: [],
      tierThresholds: { act: 80, consider: 50 },
    })
    .returning();
  return { companyId: company.id, profileConfigId: config.id };
}

async function makeListing(
  db: Awaited<ReturnType<typeof createTestD1>>["db"],
  companyId: number,
  title: string,
) {
  const [listing] = await db
    .insert(listings)
    .values({
      companyId,
      title,
      linkType: "stable",
      source: "manual",
      remoteType: "remote",
      deadlineSource: "none",
      status: "live",
      triage: "scored",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    })
    .returning();
  return listing.id;
}

describe("getTierSummary", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("returns zero counts and a null previousRunId with no runs at all", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;

    const summary = await getTierSummary(db);

    expect(summary).toEqual({
      counts: { act: 0, consider: 0, skip: 0 },
      deltas: { act: 0, consider: 0, skip: 0 },
      previousRunId: null,
    });
  });

  it("has a null previousRunId with only one completed run (nothing to diff against)", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const { companyId, profileConfigId } = await seedBaseRow(db);
    const listingId = await makeListing(db, companyId, "Only role");

    await db.insert(runs).values({
      runNumber: 1,
      kind: "manual",
      startedAt: new Date("2026-01-01T00:00:00Z"),
      completedAt: new Date("2026-01-01T01:00:00Z"),
    });
    await db.insert(scores).values({
      listingId,
      profileConfigId,
      axes: {},
      total: 90,
      tier: "act",
      scoredBy: "manual",
      createdAt: new Date("2026-01-01T02:00:00Z"),
    });

    const summary = await getTierSummary(db);

    expect(summary.counts).toEqual({ act: 1, consider: 0, skip: 0 });
    expect(summary.previousRunId).toBeNull();
  });

  it("diffs current counts against the state as of the previous run's completedAt", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const { companyId, profileConfigId } = await seedBaseRow(db);

    const listingA = await makeListing(db, companyId, "Role A");
    const listingB = await makeListing(db, companyId, "Role B");
    const listingC = await makeListing(db, companyId, "Role C");

    const [run1] = await db
      .insert(runs)
      .values({
        runNumber: 1,
        kind: "manual",
        startedAt: new Date("2026-01-01T00:00:00Z"),
        completedAt: new Date("2026-01-01T01:00:00Z"),
      })
      .returning();
    const [run2] = await db
      .insert(runs)
      .values({
        runNumber: 2,
        kind: "manual",
        startedAt: new Date("2026-01-08T00:00:00Z"),
        completedAt: new Date("2026-01-08T01:00:00Z"),
      })
      .returning();

    // As of run1's completedAt: A=act, B=consider. C not scored yet.
    await db.insert(scores).values([
      {
        listingId: listingA,
        profileConfigId,
        axes: {},
        total: 90,
        tier: "act",
        scoredBy: "manual",
        createdAt: new Date("2026-01-01T00:30:00Z"),
      },
      {
        listingId: listingB,
        profileConfigId,
        axes: {},
        total: 60,
        tier: "consider",
        scoredBy: "manual",
        createdAt: new Date("2026-01-01T00:45:00Z"),
      },
    ]);

    // After run1 but before/at run2: B gets rescored to act, C gets scored
    // as skip. These should count in "current" but not in the "as of run1"
    // snapshot.
    await db.insert(scores).values([
      {
        listingId: listingB,
        profileConfigId,
        axes: {},
        total: 95,
        tier: "act",
        scoredBy: "manual",
        createdAt: new Date("2026-01-05T00:00:00Z"),
      },
      {
        listingId: listingC,
        profileConfigId,
        axes: {},
        total: 10,
        tier: "skip",
        scoredBy: "manual",
        createdAt: new Date("2026-01-06T00:00:00Z"),
      },
    ]);

    const summary = await getTierSummary(db);

    // Current: A=act, B=act, C=skip -> act:2, consider:0, skip:1
    expect(summary.counts).toEqual({ act: 2, consider: 0, skip: 1 });
    // As of run1 completedAt: A=act, B=consider -> act:1, consider:1, skip:0
    // Delta = current - asOf
    expect(summary.deltas).toEqual({ act: 1, consider: -1, skip: 1 });
    expect(summary.previousRunId).toBe(run1.id);
    expect(run2.id).toBeGreaterThan(run1.id);
  });

  it("only counts a listing's latest score, not every historical score", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const { companyId, profileConfigId } = await seedBaseRow(db);
    const listingId = await makeListing(db, companyId, "Rescored role");

    await db.insert(scores).values([
      {
        listingId,
        profileConfigId,
        axes: {},
        total: 10,
        tier: "skip",
        scoredBy: "manual",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        listingId,
        profileConfigId,
        axes: {},
        total: 90,
        tier: "act",
        scoredBy: "manual",
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);

    const summary = await getTierSummary(db);

    expect(summary.counts).toEqual({ act: 1, consider: 0, skip: 0 });
  });
});
