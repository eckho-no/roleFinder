import type { SessionPayload } from "./session";

/**
 * Picks the D1 binding for a resolved session. This is the one and only
 * place that decision gets made — a demo session must never be able to
 * reach `env.DB` (the real board) through any code path. Chosen over an
 * `is_demo` row flag specifically because a forgotten `WHERE` clause is a
 * code-review problem, while a session that never holds the real binding
 * isn't reachable at all (see docs/adr/0004-demo-data-isolation.md).
 */
export function databaseForSession(
  session: SessionPayload,
  env: Pick<CloudflareEnv, "DB" | "DEMO_DB">,
): D1Database {
  return session.role === "demo" ? env.DEMO_DB : env.DB;
}
