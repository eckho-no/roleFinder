import { afterEach, describe, expect, it } from "vitest";

import { companies, listings } from "../schema";
import { getDeadlineRail } from "./deadline-rail";
import { createTestD1 } from "./test-d1";

const NOW = new Date("2026-06-01T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

async function seedCompany(db: Awaited<ReturnType<typeof createTestD1>>["db"], name: string) {
  const [company] = await db
    .insert(companies)
    .values({ name, slug: name.toLowerCase().replace(/\s+/g, "-") })
    .returning();
  return company.id;
}

type ListingOverrides = Partial<{
  title: string;
  expiresAt: Date | null;
  deadlineSource: "stated" | "inferred" | "none";
  status: "live" | "closed" | "expired" | "unknown";
}>;

async function seedListing(
  db: Awaited<ReturnType<typeof createTestD1>>["db"],
  companyId: number,
  overrides: ListingOverrides = {},
) {
  const [listing] = await db
    .insert(listings)
    .values({
      companyId,
      title: overrides.title ?? "Role",
      linkType: "stable",
      source: "manual",
      remoteType: "remote",
      expiresAt: overrides.expiresAt ?? null,
      deadlineSource: overrides.deadlineSource ?? "none",
      status: overrides.status ?? "live",
      triage: "scored",
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    })
    .returning();
  return listing.id;
}

describe("getDeadlineRail", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("returns an empty list when nothing is closing soon", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    await seedListing(db, companyId, {
      title: "Far out role",
      expiresAt: new Date(NOW.getTime() + 30 * DAY_MS),
      deadlineSource: "stated",
    });

    const rail = await getDeadlineRail(db, NOW);

    expect(rail).toEqual([]);
  });

  it("includes listings expiring within 14 days, ascending", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");

    await seedListing(db, companyId, {
      title: "Later this window",
      expiresAt: new Date(NOW.getTime() + 10 * DAY_MS),
      deadlineSource: "stated",
    });
    await seedListing(db, companyId, {
      title: "Sooner",
      expiresAt: new Date(NOW.getTime() + 2 * DAY_MS),
      deadlineSource: "inferred",
    });

    const rail = await getDeadlineRail(db, NOW);

    expect(rail.map((entry) => entry.title)).toEqual(["Sooner", "Later this window"]);
  });

  it("excludes listings expiring beyond the 14-day window", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    await seedListing(db, companyId, {
      title: "Outside window",
      expiresAt: new Date(NOW.getTime() + 15 * DAY_MS),
      deadlineSource: "stated",
    });

    const rail = await getDeadlineRail(db, NOW);

    expect(rail).toEqual([]);
  });

  it("excludes listings that have already expired", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    await seedListing(db, companyId, {
      title: "Already expired",
      expiresAt: new Date(NOW.getTime() - DAY_MS),
      deadlineSource: "stated",
    });

    const rail = await getDeadlineRail(db, NOW);

    expect(rail).toEqual([]);
  });

  it("excludes listings with no expiresAt at all", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme");
    await seedListing(db, companyId, {
      title: "No deadline",
      expiresAt: null,
      deadlineSource: "none",
    });

    const rail = await getDeadlineRail(db, NOW);

    expect(rail).toEqual([]);
  });

  it("carries through the deadline source and company name", async () => {
    const { db, dispose } = await createTestD1();
    cleanup = dispose;
    const companyId = await seedCompany(db, "Acme Corp");
    await seedListing(db, companyId, {
      title: "Inferred deadline role",
      expiresAt: new Date(NOW.getTime() + 3 * DAY_MS),
      deadlineSource: "inferred",
    });

    const rail = await getDeadlineRail(db, NOW);

    expect(rail).toEqual([
      expect.objectContaining({
        title: "Inferred deadline role",
        companyName: "Acme Corp",
        deadlineSource: "inferred",
      }),
    ]);
  });
});
