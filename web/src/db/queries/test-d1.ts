import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { getPlatformProxy } from "wrangler";

import { getDb } from "../client";

const MIGRATION_SQL = readFileSync(
  fileURLToPath(new URL("../../../migrations/0000_freezing_wendell_vaughn.sql", import.meta.url)),
  "utf8",
);

const WRANGLER_CONFIG_PATH = fileURLToPath(
  new URL("../../../wrangler.jsonc", import.meta.url),
);

/**
 * Spins up a real local D1 database via `wrangler`'s `getPlatformProxy` (the
 * same stable API `next dev`/OpenNext use for local Cloudflare bindings) and
 * applies the single Drizzle migration, so query modules under
 * `src/db/queries` are tested against actual SQLite semantics (window
 * functions, D1's SQL dialect) instead of a hand-rolled mock of the query
 * builder. `persist: false` keeps each call's state in-memory and isolated
 * from any other run — nothing touches the real `.wrangler/state` dir used
 * by `npm run dev`. Callers must `await dispose()` when done.
 */
export async function createTestD1(): Promise<{
  db: ReturnType<typeof getDb>;
  dispose: () => Promise<void>;
}> {
  const proxy = await getPlatformProxy<CloudflareEnv>({
    configPath: WRANGLER_CONFIG_PATH,
    persist: false,
  });

  // migrations/0000_....sql uses Drizzle's `--> statement-breakpoint` marker
  // between statements — D1's `.exec()` wants one statement per call, and
  // (per its docs) each statement on a single line, so multi-line
  // `CREATE TABLE (...)` bodies get flattened to spaces first.
  const statements = MIGRATION_SQL.split("--> statement-breakpoint")
    .map((statement) => statement.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
  for (const statement of statements) {
    await proxy.env.DB.exec(statement);
  }

  return { db: getDb(proxy.env.DB), dispose: proxy.dispose };
}
