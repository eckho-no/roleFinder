import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import { createSessionCookie, newExpiry, SESSION_COOKIE_NAME } from "@/lib/auth/session";

const SESSION_SIGNING_SECRET = "test-session-signing-secret";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(async () => ({
    env: { SESSION_SIGNING_SECRET } as unknown as CloudflareEnv,
    cf: undefined,
    ctx: {} as ExecutionContext,
  })),
}));

const { middleware } = await import("./middleware");

function requestTo(path: string, cookieValue?: string): NextRequest {
  return new NextRequest(`https://rolefinder.example${path}`, {
    headers: cookieValue ? { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` } : undefined,
  });
}

describe("middleware", () => {
  it("lets POST /api/auth/login through with no session at all", async () => {
    const response = await middleware(requestTo("/api/auth/login"));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("rejects a protected path with no session cookie", async () => {
    const response = await middleware(requestTo("/"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false });
  });

  it("rejects a protected path with a tampered session cookie", async () => {
    const cookie = await createSessionCookie(
      { role: "real", expiresAt: newExpiry() },
      SESSION_SIGNING_SECRET,
    );
    // Flip the first character, not the last — base64url's final character
    // can have discarded low bits (byte-count mod 3 != 0), so a last-char
    // flip can silently decode to the same bytes. The first character's
    // bits are always fully significant.
    const tampered = (cookie[0] === "A" ? "B" : "A") + cookie.slice(1);

    const response = await middleware(requestTo("/", tampered));

    expect(response.status).toBe(401);
  });

  it("rejects a protected path with an expired session cookie", async () => {
    const cookie = await createSessionCookie(
      { role: "real", expiresAt: Date.now() - 1000 },
      SESSION_SIGNING_SECRET,
    );

    const response = await middleware(requestTo("/", cookie));

    expect(response.status).toBe(401);
  });

  it("lets a protected path through with a valid session cookie", async () => {
    const cookie = await createSessionCookie(
      { role: "real", expiresAt: newExpiry() },
      SESSION_SIGNING_SECRET,
    );

    const response = await middleware(requestTo("/", cookie));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
