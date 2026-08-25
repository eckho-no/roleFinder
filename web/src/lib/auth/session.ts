// Stateless, HMAC-signed session cookie. No `sessions` table exists in D1 —
// the entire session lives in the signed payload, verified on every request
// via `SESSION_SIGNING_SECRET` (see AGENTS.md §6: Web Crypto only).

export type SessionRole = "real" | "demo";

export type SessionPayload = {
  role: SessionRole;
  /** Unix ms timestamp — checked against `Date.now()` on every verify. */
  expiresAt: number;
};

export const SESSION_COOKIE_NAME = "rf_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** Same no-early-exit byte compare as `constant-time-compare.ts`. */
function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function newExpiry(now: number = Date.now()): number {
  return now + SESSION_TTL_MS;
}

/** Signs `payload` and returns the `<payload>.<signature>` cookie value. */
export async function createSessionCookie(
  payload: SessionPayload,
  signingSecret: string,
): Promise<string> {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
  const key = await importSigningKey(signingSecret);
  const signature = await crypto.subtle.sign("HMAC", key, payloadBytes);
  return `${base64UrlEncode(payloadBytes)}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/**
 * Verifies signature and expiry. Returns the payload on success, `null` on
 * any failure (malformed value, bad signature, or expired) — callers must
 * not distinguish these cases in their response.
 */
export async function verifySessionCookie(
  cookieValue: string | undefined,
  signingSecret: string,
): Promise<SessionPayload | null> {
  if (!cookieValue) return null;

  const parts = cookieValue.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSignature] = parts;

  let payloadBytes: Uint8Array<ArrayBuffer>;
  let submittedSignature: Uint8Array<ArrayBuffer>;
  try {
    payloadBytes = base64UrlDecode(encodedPayload);
    submittedSignature = base64UrlDecode(encodedSignature);
  } catch {
    return null;
  }

  const key = await importSigningKey(signingSecret);
  const expectedSignature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, payloadBytes),
  );
  if (!constantTimeEqualBytes(submittedSignature, expectedSignature)) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload.expiresAt !== "number" || Date.now() >= payload.expiresAt) {
    return null;
  }
  if (payload.role !== "real" && payload.role !== "demo") {
    return null;
  }

  return payload;
}
