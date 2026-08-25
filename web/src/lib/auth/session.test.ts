import { describe, expect, it } from "vitest";

import {
  createSessionCookie,
  newExpiry,
  verifySessionCookie,
  type SessionPayload,
} from "./session";

const SECRET = "test-session-signing-secret";

function payload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return { role: "real", expiresAt: newExpiry(), ...overrides };
}

describe("createSessionCookie / verifySessionCookie", () => {
  it("round-trips a valid cookie", async () => {
    const cookie = await createSessionCookie(payload({ role: "demo" }), SECRET);
    const verified = await verifySessionCookie(cookie, SECRET);

    expect(verified).toEqual({ role: "demo", expiresAt: expect.any(Number) });
  });

  it("rejects a cookie signed with a different secret", async () => {
    const cookie = await createSessionCookie(payload(), SECRET);
    const verified = await verifySessionCookie(cookie, "wrong-secret");

    expect(verified).toBeNull();
  });

  it("rejects a cookie with a tampered payload", async () => {
    const cookie = await createSessionCookie(payload({ role: "real" }), SECRET);
    const [encodedPayload, encodedSignature] = cookie.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ role: "demo", expiresAt: newExpiry() }))
      .toString("base64url");
    const tampered = `${tamperedPayload}.${encodedSignature}`;

    expect(tampered).not.toBe(cookie);
    expect(encodedPayload).toBeTruthy();
    await expect(verifySessionCookie(tampered, SECRET)).resolves.toBeNull();
  });

  it("rejects a cookie with a tampered signature", async () => {
    const cookie = await createSessionCookie(payload(), SECRET);
    const [encodedPayload, encodedSignature] = cookie.split(".");
    const flipped = encodedSignature.slice(0, -1) + (encodedSignature.endsWith("A") ? "B" : "A");
    const tampered = `${encodedPayload}.${flipped}`;

    await expect(verifySessionCookie(tampered, SECRET)).resolves.toBeNull();
  });

  it("rejects an expired cookie", async () => {
    const cookie = await createSessionCookie(
      payload({ expiresAt: Date.now() - 1000 }),
      SECRET,
    );

    await expect(verifySessionCookie(cookie, SECRET)).resolves.toBeNull();
  });

  it("rejects a malformed cookie value", async () => {
    await expect(verifySessionCookie("not-a-valid-cookie", SECRET)).resolves.toBeNull();
    await expect(verifySessionCookie("", SECRET)).resolves.toBeNull();
    await expect(verifySessionCookie(undefined, SECRET)).resolves.toBeNull();
  });

  it("rejects a payload with an invalid role", async () => {
    const payloadBytes = Buffer.from(
      JSON.stringify({ role: "admin", expiresAt: newExpiry() }),
    ).toString("base64url");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(JSON.stringify({ role: "admin", expiresAt: newExpiry() })),
    );
    const encodedSignature = Buffer.from(new Uint8Array(signature)).toString("base64url");
    const cookie = `${payloadBytes}.${encodedSignature}`;

    await expect(verifySessionCookie(cookie, SECRET)).resolves.toBeNull();
  });
});
