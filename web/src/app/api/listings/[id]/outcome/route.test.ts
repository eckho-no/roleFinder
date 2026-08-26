import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie, newExpiry, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const SESSION_SIGNING_SECRET = "test-session-signing-secret";
const REAL_DB = { marker: "real" } as unknown as D1Database;
const DEMO_DB = { marker: "demo" } as unknown as D1Database;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: {
      SESSION_SIGNING_SECRET,
      DB: REAL_DB,
      DEMO_DB,
    } as unknown as CloudflareEnv,
    cf: undefined,
    ctx: {} as ExecutionContext,
  })),
}));

// A minimal fake standing in for the Drizzle client returned by `getDb`,
// covering only the chain shapes this route actually calls
// (`select().from().where().limit()` and `update().set().where()`). Each
// fake remembers which binding (`REAL_DB`/`DEMO_DB`) built it, recorded on
// every `update` call, so a test can assert a demo session's request never
// reaches `getDb` at all (the write route is rejected before that point).
let existingListingIds: Set<number>;
let updateCalls: Array<{ binding: D1Database; listingId: number; outcome: string }>;

vi.mock("@/db/client", () => ({
  getDb: (binding: D1Database) => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const id = [...existingListingIds][0];
            return id !== undefined ? [{ id }] : [];
          },
        }),
      }),
    }),
    update: () => ({
      set: (values: { outcome: string }) => ({
        where: async () => {
          updateCalls.push({
            binding,
            listingId: [...existingListingIds][0]!,
            outcome: values.outcome,
          });
        },
      }),
    }),
  }),
}));

const { POST } = await import("./route");

async function sessionCookieFor(role: "real" | "demo"): Promise<string> {
  return createSessionCookie({ role, expiresAt: newExpiry() }, SESSION_SIGNING_SECRET);
}

function outcomeRequest(listingId: string, body: unknown, cookie?: string): Request {
  return new Request(`https://rolefinder.example/api/listings/${listingId}/outcome`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function context(listingId: string) {
  return { params: Promise.resolve({ id: listingId }) };
}

describe("POST /api/listings/[id]/outcome", () => {
  beforeEach(() => {
    existingListingIds = new Set([42]);
    updateCalls = [];
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await POST(outcomeRequest("42", { outcome: "applied" }), context("42"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "unauthorized" });
    expect(updateCalls).toHaveLength(0);
  });

  it("rejects a demo session with 403 and never issues the write", async () => {
    const cookie = await sessionCookieFor("demo");

    const response = await POST(
      outcomeRequest("42", { outcome: "applied" }, cookie),
      context("42"),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "read_only_session",
    });
    expect(updateCalls).toHaveLength(0);
  });

  it("updates the outcome for a real session with a valid value", async () => {
    const cookie = await sessionCookieFor("real");

    const response = await POST(
      outcomeRequest("42", { outcome: "interviewed" }, cookie),
      context("42"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(updateCalls).toEqual([{ binding: REAL_DB, listingId: 42, outcome: "interviewed" }]);
  });

  it("rejects an invalid outcome value with 400 and no write", async () => {
    const cookie = await sessionCookieFor("real");

    const response = await POST(
      outcomeRequest("42", { outcome: "not-a-real-outcome" }, cookie),
      context("42"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_outcome" });
    expect(updateCalls).toHaveLength(0);
  });

  it("rejects a non-numeric listing id with 400", async () => {
    const cookie = await sessionCookieFor("real");

    const response = await POST(
      outcomeRequest("not-a-number", { outcome: "applied" }, cookie),
      context("not-a-number"),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_listing_id" });
  });

  it("returns 404 for a listing that doesn't exist", async () => {
    existingListingIds = new Set();
    const cookie = await sessionCookieFor("real");

    const response = await POST(
      outcomeRequest("999", { outcome: "applied" }, cookie),
      context("999"),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "listing_not_found" });
  });

  it("returns the same 400 shape for a malformed JSON body", async () => {
    const cookie = await sessionCookieFor("real");
    const malformed = new Request("https://rolefinder.example/api/listings/42/outcome", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      body: "not json",
    });

    const response = await POST(malformed, context("42"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_outcome" });
  });
});
