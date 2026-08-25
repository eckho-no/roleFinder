import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";

import { constantTimeCompare } from "@/lib/auth/constant-time-compare";

// This route intentionally does not set a session cookie yet — issuing and
// verifying the HMAC-signed session is #20's job. For #19 the contract is
// just: compare the submitted password to `AUTH_PASSWORD` in constant time
// and report success/failure, with no observable difference (status code,
// body shape, or timing) between "wrong password" and "missing password".

type LoginResult = { ok: true } | { ok: false };

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
  const submitted = await readSubmittedPassword(request);

  // No early return on `submitted === null` — it flows into the same
  // constant-time compare as any wrong password, so a missing field and an
  // incorrect field are indistinguishable in both response and timing.
  const isValid = await constantTimeCompare(submitted, env.AUTH_PASSWORD);

  return loginResponse(isValid);
}
