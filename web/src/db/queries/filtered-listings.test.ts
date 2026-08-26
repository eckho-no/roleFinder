import { afterEach, describe, expect, it } from "vitest";

import { companies, listings, profileConfig, scores } from "../schema";
import { getFilteredListings, parseDashboardFilters } from "./filtered-listings";
import { createTestD1 } from "./test-d1";

describe("parseDashboardFilters", () => {
  it("parses known enum values for each filter key", () => {
    expect(
      parseDashboardFilters({ tier: "act", status: "live", triage: "logged_only", source: "indeed" }),
    ).toEqual({ tier: "act", status: "live", triage: "logged_only", source: "indeed" });
  });

  it("reaches triage=logged_only specifically — the largest triage category", () => {
    expect(parseDashboardFilters({ triage: "logged_only" }).triage).toBe("logged_only");
  });

  it("drops unknown/stale values instead of throwing", () => {
    expect(parseDashboardFilters({ tier: "urgent", status: "live" })).toEqual({
      tier: undefined,
      status: "live",
      triage: undefined,
      source: undefined,
    });
  });

  it("returns all-undefined for no search params at all", () => {
    expect(parseDashboardFilters({})).toEqual({
      tier: undefined,
      status: undefined,
      triage: undefined,
      source: undefined,
    });
  });

  it("takes the first value when a key repeats (array form)", () => {
    expect(parseDashboardFilters({ status: ["live", "closed"] }).status).toBe("live");
  });
});

async function seedCompany(db: Awaited<ReturnType<typeof createTestD1>>["db"], name: string) {
  const [company] = await db
    .insert(companies)
    .values({ name, slug: name.toLowerCase().replace(/\s+/g, "-") })
    .returning();
  return company.id;
}

async function seedListing(
  db: Awaited<ReturnType<typeof createTestD1>>["db"],
  companyId: number,
  overrides: Partial<{
    title: string;
    status: "live" | "closed" | "expired" | "unknown";
    triage: "pending_review" | "scored" | "logged_only" | "rejected" | "merged";
    source: "indeed" | "adzuna" | "reed" | "gmail_alert" | "manual";
  }> = {},
) {
  const now = new Date("2026-06-01T00:00:00Z");
  const [listing] = await db
    .insert(listings)
    .values({
      companyId,
      title: overrides.title ?? "Role",
      linkType: "stable",
      source: overrides.source ?? "manual",
      remoteType: "remote",
      deadlineSource: "none",
      status: overrides.status ?? "live",
      triage: overrides.triage ?? "pending_review",
      firstSeenAt: now,
      lastSeenAt: now,
    })
    .returning();
  return listing.id;
}

describe("getFilteredListings", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("returns everything when no filters are set", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    await seedListing(db, companyId, { title: "A" });
    await seedListing(db, companyId, { title: "B" });

    const result = await getFilteredListings(db, {});

    expect(result).toHaveLength(2);
  });

  it("filters by status", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    await seedListing(db, companyId, { title: "Live one", status: "live" });
    await seedListing(db, companyId, { title: "Closed one", status: "closed" });

    const result = await getFilteredListings(db, { status: "closed" });

    expect(result.map((r) => r.title)).toEqual(["Closed one"]);
  });

  it("filters by triage=logged_only", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    await seedListing(db, companyId, { title: "Logged", triage: "logged_only" });
    await seedListing(db, companyId, { title: "Scored", triage: "scored" });

    const result = await getFilteredListings(db, { triage: "logged_only" });

    expect(result.map((r) => r.title)).toEqual(["Logged"]);
  });

  it("filters by source", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    await seedListing(db, companyId, { title: "From Indeed", source: "indeed" });
    await seedListing(db, companyId, { title: "From Reed", source: "reed" });

    const result = await getFilteredListings(db, { source: "indeed" });

    expect(result.map((r) => r.title)).toEqual(["From Indeed"]);
  });

  it("filters by tier using each listing's latest score", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    const [config] = await db
      .insert(profileConfig)
      .values({
        version: 1,
        titles: [],
        locationRules: { commutable: [], notCommutable: [], radiusMiles: 0, londonRule: "" },
        salaryFloor: 0,
        salaryHardFloor: 0,
        positioning: {},
        axes: [],
        tierThresholds: { act: 80, consider: 50 },
      })
      .returning();

    const actListing = await seedListing(db, companyId, { title: "Act role" });
    const rescored = await seedListing(db, companyId, { title: "Rescored role" });
    // Deliberately left with no score at all — should be excluded by a
    // tier filter without erroring, unlike the "no filter" case tested
    // separately below where it's included with tier: null.
    await seedListing(db, companyId, { title: "Unscored role" });

    await db.insert(scores).values([
      {
        listingId: actListing,
        profileConfigId: config.id,
        axes: {},
        total: 90,
        tier: "act",
        scoredBy: "manual",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        listingId: rescored,
        profileConfigId: config.id,
        axes: {},
        total: 10,
        tier: "skip",
        scoredBy: "manual",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
      {
        listingId: rescored,
        profileConfigId: config.id,
        axes: {},
        total: 95,
        tier: "act",
        scoredBy: "manual",
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ]);

    const result = await getFilteredListings(db, { tier: "act" });

    expect(result.map((r) => r.title).sort()).toEqual(["Act role", "Rescored role"]);
  });

  it("combines multiple filters with AND semantics", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    await seedListing(db, companyId, {
      title: "Matches both",
      status: "live",
      triage: "logged_only",
    });
    await seedListing(db, companyId, {
      title: "Matches only status",
      status: "live",
      triage: "scored",
    });

    const result = await getFilteredListings(db, { status: "live", triage: "logged_only" });

    expect(result.map((r) => r.title)).toEqual(["Matches both"]);
  });

  it("includes unscored listings when no tier filter is set, with tier: null", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    await seedListing(db, companyId, { title: "Unscored" });

    const result = await getFilteredListings(db, {});

    expect(result).toEqual([expect.objectContaining({ title: "Unscored", tier: null })]);
  });
});
