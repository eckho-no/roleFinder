import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { constantTimeCompare } from "@/lib/auth/constant-time-compare";
import { checkAndRecordLoginAttempt, clientIp } from "@/lib/auth/rate-limit";
import {
  createSessionCookie,
  newExpiry,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";

type LoginResult = { ok: true } | { ok: false };

function lockedOutResponse(retryAfterSeconds: number): NextResponse<LoginResult> {
  // Same body shape as any other failure — a lockout must not reveal
  // whether the password being guessed was close to correct, only that
  // this IP has made too many attempts.
  return NextResponse.json(
    { ok: false },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

function loginResponse(ok: boolean): NextResponse<LoginResult> {
  // Same status code and same response shape on every failure path — a
  // missing password must not produce a distinct "bad request" response
  // that would let an attacker distinguish "no password sent" from "wrong
  // password sent" without needing to time anything.
  return NextResponse.json({ ok }, { status: ok ? 200 : 401 });
}

async function readSubmittedPassword(request: Request): Promise<string | null> {
  // Read the body defensively: malformed JSON, a non-object body, or a
  // missing `password` field should all fall through to the same
  // "no password submitted" value (null) and then the same HMAC-compare
  // path below — never an early return with a different response.
  try {
    const body: unknown = await request.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "password" in body &&
      typeof (body as { password: unknown }).password === "string"
    ) {
      return (body as { password: string }).password;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: Request): Promise<NextResponse<LoginResult>> {
  const { env } = await getCloudflareContext({ async: true });

  // Rate-limit before touching the password at all — a locked-out request
  // never reaches `constantTimeCompare`, so the lockout itself can't leak
  // any timing information about the submitted password.
  const rateLimit = await checkAndRecordLoginAttempt(env.KV, clientIp(request));
  if (!rateLimit.allowed) {
    return lockedOutResponse(rateLimit.retryAfterSeconds);
  }

  const submitted = await readSubmittedPassword(request);

  // No early return on `submitted === null` — it flows into the same
  // constant-time compare as any wrong password, so a missing field and an
  // incorrect field are indistinguishable in both response and timing.
  const isValid = await constantTimeCompare(submitted, env.AUTH_PASSWORD);
  const response = loginResponse(isValid);
  if (!isValid) return response;

  const sessionCookie = await createSessionCookie(
    { role: "real", expiresAt: newExpiry() },
    env.SESSION_SIGNING_SECRET,
  );
  response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
