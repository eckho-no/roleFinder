import { getCloudflareContext } from "@opennextjs/cloudflare";

import { SESSION_COOKIE_NAME, verifySessionCookie, type SessionPayload } from "./session";

export class UnauthorizedError extends Error {
  constructor() {
    super("No valid session");
  }
}

export class ReadOnlySessionError extends Error {
  constructor() {
    super("Demo sessions are read-only");
  }
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    if (part.slice(0, separatorIndex).trim() === name) {
      return part.slice(separatorIndex + 1).trim();
    }
  }
  return undefined;
}

/**
 * Verifies the session cookie on `request` independently of `middleware.ts`
 * — every API route handler that isn't explicitly public must call this, so
 * a matcher typo in middleware doesn't leave the route reachable. Throws
 * `UnauthorizedError` (never returns a "maybe" value) when there's no valid
 * session.
 */
export async function requireSession(request: Request): Promise<SessionPayload> {
  const { env } = await getCloudflareContext({ async: true });
  const cookieValue = readCookie(request, SESSION_COOKIE_NAME);
  const session = await verifySessionCookie(cookieValue, env.SESSION_SIGNING_SECRET);
  if (!session) throw new UnauthorizedError();
  return session;
}

/** Throws `ReadOnlySessionError` for a demo session; otherwise a no-op. */
export function assertWritable(session: SessionPayload): void {
  if (session.role === "demo") throw new ReadOnlySessionError();
}

/**
 * `requireSession` plus the read-only check in one call — every write
 * route handler and every agent-invocation route handler must use this
 * (not `requireSession` alone), so a demo session can never mutate data or
 * trigger a paid agent call.
 */
export async function requireWritableSession(request: Request): Promise<SessionPayload> {
  const session = await requireSession(request);
  assertWritable(session);
  return session;
}
