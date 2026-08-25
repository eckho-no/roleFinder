import { describe, expect, it } from "vitest";

import { checkAndRecordLoginAttempt, clientIp, type RateLimitKV } from "./rate-limit";

function fakeKv(): RateLimitKV {
  const store = new Map<string, string>();
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value);
    },
  } as RateLimitKV;
}

const WINDOW_MS = 15 * 60 * 1000;

describe("checkAndRecordLoginAttempt", () => {
  it("allows the first several attempts within the window", async () => {
    const kv = fakeKv();
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      const result = await checkAndRecordLoginAttempt(kv, "1.2.3.4", now);
      expect(result.allowed).toBe(true);
    }
  });

  it("locks out after the 6th attempt within the window", async () => {
    const kv = fakeKv();
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      await checkAndRecordLoginAttempt(kv, "1.2.3.4", now);
    }
    const sixth = await checkAndRecordLoginAttempt(kv, "1.2.3.4", now);

    expect(sixth.allowed).toBe(false);
    if (!sixth.allowed) {
      expect(sixth.retryAfterSeconds).toBeGreaterThan(0);
      expect(sixth.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_MS / 1000);
    }
  });

  it("tracks separate IPs independently", async () => {
    const kv = fakeKv();
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      await checkAndRecordLoginAttempt(kv, "1.2.3.4", now);
    }
    const otherIp = await checkAndRecordLoginAttempt(kv, "5.6.7.8", now);

    expect(otherIp.allowed).toBe(true);
  });

  it("resets the window once it has elapsed", async () => {
    const kv = fakeKv();
    const now = Date.now();

    for (let i = 0; i < 5; i++) {
      await checkAndRecordLoginAttempt(kv, "1.2.3.4", now);
    }
    const lockedOut = await checkAndRecordLoginAttempt(kv, "1.2.3.4", now);
    expect(lockedOut.allowed).toBe(false);

    const afterWindow = await checkAndRecordLoginAttempt(
      kv,
      "1.2.3.4",
      now + WINDOW_MS + 1,
    );
    expect(afterWindow.allowed).toBe(true);
  });
});

describe("clientIp", () => {
  it("reads CF-Connecting-IP", () => {
    const request = new Request("https://rolefinder.example/api/auth/login", {
      headers: { "cf-connecting-ip": "9.9.9.9" },
    });

    expect(clientIp(request)).toBe("9.9.9.9");
  });

  it("falls back to \"unknown\" when the header is absent", () => {
    const request = new Request("https://rolefinder.example/api/auth/login");

    expect(clientIp(request)).toBe("unknown");
  });
});
