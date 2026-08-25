import { describe, expect, it, vi } from "vitest";

import { createSessionCookie, newExpiry, SESSION_COOKIE_NAME } from "./session";

const SESSION_SIGNING_SECRET = "test-session-signing-secret";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { SESSION_SIGNING_SECRET } as unknown as CloudflareEnv,
    cf: undefined,
    ctx: {} as ExecutionContext,
  })),
}));

// Imported after the mock, and called directly here with no proxy gate in
// the loop at all — this is the "even with middleware bypassed" proof from
// issue #21's acceptance criteria.
const {
  requireSession,
  requireWritableSession,
  assertWritable,
  UnauthorizedError,
  ReadOnlySessionError,
} = await import("./require-session");

function requestWithCookie(cookieValue?: string): Request {
  return new Request("https://rolefinder.example/api/whatever", {
    headers: cookieValue ? { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` } : {},
  });
}

describe("requireSession", () => {
  it("resolves with the session payload for a valid cookie", async () => {
    const cookie = await createSessionCookie(
      { role: "real", expiresAt: newExpiry() },
      SESSION_SIGNING_SECRET,
    );

    await expect(requireSession(requestWithCookie(cookie))).resolves.toMatchObject({
      role: "real",
    });
  });

  it("rejects a request with no cookie header at all", async () => {
    await expect(requireSession(requestWithCookie())).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rejects a request with a tampered cookie", async () => {
    const cookie = await createSessionCookie(
      { role: "real", expiresAt: newExpiry() },
      SESSION_SIGNING_SECRET,
    );
    // Flip the first character, not the last — see the equivalent comment
    // in middleware.test.ts for why a last-char flip can be a silent no-op.
    const tampered = (cookie[0] === "A" ? "B" : "A") + cookie.slice(1);

    await expect(requireSession(requestWithCookie(tampered))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("rejects an expired cookie", async () => {
    const cookie = await createSessionCookie(
      { role: "real", expiresAt: Date.now() - 1000 },
      SESSION_SIGNING_SECRET,
    );

    await expect(requireSession(requestWithCookie(cookie))).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });
});

describe("assertWritable", () => {
  it("is a no-op for a real session", () => {
    expect(() => assertWritable({ role: "real", expiresAt: newExpiry() })).not.toThrow();
  });

  it("throws ReadOnlySessionError for a demo session", () => {
    expect(() => assertWritable({ role: "demo", expiresAt: newExpiry() })).toThrow(
      ReadOnlySessionError,
    );
  });
});

describe("requireWritableSession", () => {
  it("resolves for a real session", async () => {
    const cookie = await createSessionCookie(
      { role: "real", expiresAt: newExpiry() },
      SESSION_SIGNING_SECRET,
    );

    await expect(
      requireWritableSession(requestWithCookie(cookie)),
    ).resolves.toMatchObject({ role: "real" });
  });

  it("rejects a demo session with ReadOnlySessionError, not UnauthorizedError", async () => {
    const cookie = await createSessionCookie(
      { role: "demo", expiresAt: newExpiry() },
      SESSION_SIGNING_SECRET,
    );

    await expect(
      requireWritableSession(requestWithCookie(cookie)),
    ).rejects.toBeInstanceOf(ReadOnlySessionError);
  });

  it("rejects an unauthenticated request with UnauthorizedError", async () => {
    await expect(
      requireWritableSession(requestWithCookie()),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
