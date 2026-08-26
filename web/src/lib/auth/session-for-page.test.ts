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

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && cookieValue !== undefined
        ? { name, value: cookieValue }
        : undefined,
  })),
}));

const { requireSessionForPage } = await import("./session-for-page");
const { UnauthorizedError } = await import("./require-session");

describe("requireSessionForPage", () => {
  it("resolves with the session payload for a valid cookie", async () => {
    cookieValue = await createSessionCookie(
      { role: "real", expiresAt: newExpiry() },
      SESSION_SIGNING_SECRET,
    );

    await expect(requireSessionForPage()).resolves.toMatchObject({ role: "real" });
  });

  it("resolves with a demo session payload", async () => {
    cookieValue = await createSessionCookie(
      { role: "demo", expiresAt: newExpiry() },
      SESSION_SIGNING_SECRET,
    );

    await expect(requireSessionForPage()).resolves.toMatchObject({ role: "demo" });
  });

  it("rejects when there is no session cookie at all", async () => {
    cookieValue = undefined;

    await expect(requireSessionForPage()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a tampered cookie", async () => {
    const cookie = await createSessionCookie(
      { role: "real", expiresAt: newExpiry() },
      SESSION_SIGNING_SECRET,
    );
    cookieValue = (cookie[0] === "A" ? "B" : "A") + cookie.slice(1);

    await expect(requireSessionForPage()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects an expired cookie", async () => {
    cookieValue = await createSessionCookie(
      { role: "real", expiresAt: Date.now() - 1000 },
      SESSION_SIGNING_SECRET,
    );

    await expect(requireSessionForPage()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
