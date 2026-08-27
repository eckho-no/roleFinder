import { beforeEach, describe, expect, it, vi } from "vitest";

import { createSessionCookie, newExpiry, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { FakeD1Database } from "@/db/test-d1";

const SESSION_SIGNING_SECRET = "test-session-signing-secret";

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

let realDb: FakeD1Database;
let demoDb: FakeD1Database;

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: {
      SESSION_SIGNING_SECRET,
      DB: realDb,
      DEMO_DB: demoDb,
    } as unknown as CloudflareEnv,
    cf: undefined,
    ctx: {} as ExecutionContext,
  })),
}));

// Imported after the mock so the route picks up the mocked bindings.
const { POST } = await import("./route");

function validBody(overrides: Record<string, unknown> = {}) {
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
    note: "test save",
    ...overrides,
  };
}

async function settingsRequest(body: unknown, cookieValue?: string): Promise<Request> {
  return new Request("https://rolefinder.example/api/settings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookieValue ? { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function realCookie(): Promise<string> {
  return createSessionCookie({ role: "real", expiresAt: newExpiry() }, SESSION_SIGNING_SECRET);
}

async function demoCookie(): Promise<string> {
  return createSessionCookie({ role: "demo", expiresAt: newExpiry() }, SESSION_SIGNING_SECRET);
}

describe("POST /api/settings", () => {
  beforeEach(() => {
    realDb = new FakeD1Database(PROFILE_CONFIG_DDL);
    demoDb = new FakeD1Database(PROFILE_CONFIG_DDL);
  });

  it("writes version 1 for a real session with no existing config", async () => {
    const response = await POST(await settingsRequest(validBody(), await realCookie()));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, version: 1 });
  });

  it("writes an incrementing version on a second save, real session", async () => {
    await POST(await settingsRequest(validBody({ note: "v1" }), await realCookie()));
    const response = await POST(
      await settingsRequest(validBody({ note: "v2" }), await realCookie()),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, version: 2 });
  });

  it("rejects a demo session with 403 and never touches the real DB", async () => {
    const response = await POST(await settingsRequest(validBody(), await demoCookie()));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { ok: boolean };
    expect(body.ok).toBe(false);

    const realRows = await realDb.prepare("SELECT * FROM profile_config").all();
    expect(realRows.results).toHaveLength(0);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const response = await POST(await settingsRequest(validBody()));

    expect(response.status).toBe(401);
  });

  it("rejects a malformed body with 400 and does not write", async () => {
    const response = await POST(
      await settingsRequest({ titles: "not-an-array" }, await realCookie()),
    );

    expect(response.status).toBe(400);
    const rows = await realDb.prepare("SELECT * FROM profile_config").all();
    expect(rows.results).toHaveLength(0);
  });

  it("rejects malformed JSON with 400", async () => {
    const request = new Request("https://rolefinder.example/api/settings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${await realCookie()}`,
      },
      body: "not json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
