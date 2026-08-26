import { beforeEach, describe, expect, it, vi } from "vitest";

import { SESSION_COOKIE_NAME, verifySessionCookie } from "@/lib/auth/session";

const AUTH_PASSWORD = "correct-horse-battery-staple";
const DEMO_PASSWORD = "rolefinder-demo";
const SESSION_SIGNING_SECRET = "test-session-signing-secret";

// A real (in-memory) KV fake, not a vi.fn — the rate limiter's own logic
// (window, count, reset) runs for real here, we're only faking storage.
const kvStore = new Map<string, string>();
const fakeKv = {
  get: async (key: string) => kvStore.get(key) ?? null,
  put: async (key: string, value: string) => {
    kvStore.set(key, value);
  },
};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: {
      AUTH_PASSWORD,
      DEMO_PASSWORD,
      SESSION_SIGNING_SECRET,
      KV: fakeKv,
    } as unknown as CloudflareEnv,
    cf: undefined,
    ctx: {} as ExecutionContext,
  })),
}));

// Imported after the mock so the route picks up the mocked binding.
const { POST } = await import("./route");

function loginRequest(body: unknown, ip = "1.2.3.4"): Request {
  return new Request("https://rolefinder.example/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kvStore.clear();
  });

  it("returns ok:true with 200 and a signed session cookie for the correct password", async () => {
    const response = await POST(loginRequest({ password: AUTH_PASSWORD }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    expect(cookie).toMatchObject({
      name: SESSION_COOKIE_NAME,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
    await expect(
      verifySessionCookie(cookie?.value, SESSION_SIGNING_SECRET),
    ).resolves.toMatchObject({ role: "real" });
  });

  it("returns ok:true with 200 and a demo-role session cookie for the demo password", async () => {
    const response = await POST(loginRequest({ password: DEMO_PASSWORD }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });

    const cookie = response.cookies.get(SESSION_COOKIE_NAME);
    await expect(
      verifySessionCookie(cookie?.value, SESSION_SIGNING_SECRET),
    ).resolves.toMatchObject({ role: "demo" });
  });

  it("returns ok:false with 401 and no session cookie for an incorrect password", async () => {
    const response = await POST(loginRequest({ password: "wrong-password" }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("returns the same shape and status for a missing password as for a wrong one", async () => {
    const missing = await POST(loginRequest({}));
    const wrong = await POST(loginRequest({ password: "wrong-password" }));

    expect(missing.status).toBe(wrong.status);
    await expect(missing.json()).resolves.toEqual(await wrong.json());
  });

  it("returns the same shape and status for an empty-string password as for a wrong one", async () => {
    const empty = await POST(loginRequest({ password: "" }));
    const wrong = await POST(loginRequest({ password: "wrong-password" }));

    expect(empty.status).toBe(wrong.status);
    await expect(empty.json()).resolves.toEqual(await wrong.json());
  });

  it("returns the same shape and status for a malformed JSON body as for a wrong password", async () => {
    const malformed = await POST(
      new Request("https://rolefinder.example/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    const wrong = await POST(loginRequest({ password: "wrong-password" }));

    expect(malformed.status).toBe(wrong.status);
    await expect(malformed.json()).resolves.toEqual(await wrong.json());
  });

  it("locks out an IP after too many attempts, even with the correct password", async () => {
    for (let i = 0; i < 5; i++) {
      await POST(loginRequest({ password: "wrong-password" }, "9.9.9.9"));
    }

    const response = await POST(loginRequest({ password: AUTH_PASSWORD }, "9.9.9.9"));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    await expect(response.json()).resolves.toEqual({ ok: false });
    expect(response.cookies.get(SESSION_COOKIE_NAME)).toBeUndefined();
  });

  it("does not rate-limit other IPs when one is locked out", async () => {
    for (let i = 0; i < 6; i++) {
      await POST(loginRequest({ password: "wrong-password" }, "9.9.9.9"));
    }

    const response = await POST(loginRequest({ password: AUTH_PASSWORD }, "8.8.8.8"));

    expect(response.status).toBe(200);
  });
});
