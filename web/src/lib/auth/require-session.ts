import { getCloudflareContext } from "@opennextjs/cloudflare";

import { SESSION_COOKIE_NAME, verifySessionCookie, type SessionPayload } from "./session";

export class UnauthorizedError extends Error {
  constructor() {
    super("No valid session");
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
