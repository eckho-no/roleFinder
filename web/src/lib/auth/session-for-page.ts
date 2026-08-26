import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";

import { SESSION_COOKIE_NAME, verifySessionCookie, type SessionPayload } from "./session";
import { UnauthorizedError } from "./require-session";

/**
 * Server-component-shaped counterpart to `requireSession` in
 * `require-session.ts`. That function takes a `Request` and reads the
 * `cookie` header directly, which route handlers have but server components
 * don't — components only get `next/headers`' `cookies()`. Middleware has
 * already rejected unauthenticated requests to any non-public path by the
 * time a page component runs, so this mainly exists to resolve *which*
 * session (real vs demo) for `databaseForSession`, not to re-decide whether
 * the request is allowed through. It still throws `UnauthorizedError` on a
 * missing/invalid cookie rather than returning a nullable, matching
 * `requireSession`'s contract, in case a page ever renders without
 * middleware in front of it (e.g. tests).
 */
export async function requireSessionForPage(): Promise<SessionPayload> {
  const { env } = await getCloudflareContext({ async: true });
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await verifySessionCookie(cookieValue, env.SESSION_SIGNING_SECRET);
  if (!session) throw new UnauthorizedError();
  return session;
}
