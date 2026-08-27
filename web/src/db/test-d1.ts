// Minimal D1Database-shaped adapter over `node:sqlite`, test-only. Real D1
// isn't available under plain vitest/node (no @cloudflare/vitest-pool-workers
// in this project), but drizzle-orm/d1's session only calls a handful of
// D1Database methods — `prepare(sql).bind(...).all()/.run()` and a top-level
// `batch(statements)` — so a thin real-SQLite adapter covering just those
// gives query modules a real database to run against instead of hand-mocked
// query results, without needing wrangler's `getPlatformProxy` (which starts
// a remote proxy session and requires a `CLOUDFLARE_API_TOKEN` — fine
// locally where `wrangler login` has already happened, but not available in
// CI; see the `web` job's failure on tier-summary.test.ts before this
// moved off it).
//
// Shared home for this (moved from `src/lib/settings/test-d1.ts`, where it
// first landed for the profile-config writer) now that dashboard query
// tests need it too — one copy for every "give me a real SQLite-backed
// D1Database in a test" caller, not one per feature.
import { readFileSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { getDb } from "./client";

type D1LikeResult = {
  results: unknown[];
  success: true;
  meta: { changes: number; last_row_id: number };
};

class FakeD1PreparedStatement {
  constructor(
    private readonly stmt: StatementSync,
    private readonly sql: string,
    private params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): FakeD1PreparedStatement {
    return new FakeD1PreparedStatement(this.stmt, this.sql, params);
  }

  private normalizedParams(): unknown[] {
    // D1 accepts JS `boolean`/`undefined`; node:sqlite wants 0/1/null.
    return this.params.map((p) => {
      if (typeof p === "boolean") return p ? 1 : 0;
      if (p === undefined) return null;
      return p;
    });
  }

  async all<T = unknown>(): Promise<{ results: T[] }> {
    const rows = this.stmt.all(...this.normalizedParams()) as T[];
    return { results: rows };
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    // Drizzle's `.values()`/`.raw()` path (used for INSERT ... RETURNING via
    // `.returning()`) wants arrays of column values, not row objects — same
    // rows `all()` would give, reshaped.
    const rows = this.stmt.all(...this.normalizedParams()) as Record<string, unknown>[];
    return rows.map((row) => Object.values(row)) as T[];
  }

  /**
   * `node:sqlite`'s `run()` doesn't return RETURNING rows, only
   * change/rowid metadata, so a statement with a RETURNING clause is
   * executed via `.all()` instead (which does return rows) and its
   * `changes`/`lastInsertRowid` approximated from that result. Good enough
   * for this test double: `changes` is only ever compared to 0 vs 1 here.
   */
  async run(): Promise<D1LikeResult> {
    const isReturning = /\breturning\b/i.test(this.sql);
    if (isReturning) {
      const rows = this.stmt.all(...this.normalizedParams()) as Record<string, unknown>[];
      const lastRow = rows.at(-1);
      return {
        results: rows,
        success: true,
        meta: {
          changes: rows.length,
          last_row_id: typeof lastRow?.id === "number" ? lastRow.id : 0,
        },
      };
    }
    const info = this.stmt.run(...this.normalizedParams());
    return {
      results: [],
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }
}

export class FakeD1Database {
  private readonly db: DatabaseSync;

  constructor(ddl: string) {
    this.db = new DatabaseSync(":memory:");
    this.db.exec(ddl);
  }

  prepare(sql: string): FakeD1PreparedStatement {
    return new FakeD1PreparedStatement(this.db.prepare(sql), sql);
  }

  async batch(statements: FakeD1PreparedStatement[]): Promise<D1LikeResult[]> {
    // D1's real batch is an implicit transaction; mirrored here so a
    // mid-batch throw leaves nothing committed, matching production
    // semantics closely enough for the conflict-repair test below.
    const results: D1LikeResult[] = [];
    this.db.exec("BEGIN");
    try {
      for (const statement of statements) {
        results.push(await statement.run());
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return results;
  }
}

const MIGRATION_SQL = readFileSync(
  fileURLToPath(new URL("../../migrations/0000_freezing_wendell_vaughn.sql", import.meta.url)),
  "utf8",
  // `node:sqlite`'s `exec()` (unlike D1's own `.exec()`) is fine with the
  // whole multi-statement migration file in one call, `--> statement-
  // breakpoint` markers and multi-line `CREATE TABLE` bodies included — no
  // splitting needed, just strip the marker itself since it's not SQL.
).replace(/--> statement-breakpoint/g, "");

/**
 * Full-schema counterpart to `new FakeD1Database(ddl)` for query modules
 * under `src/db/queries` that span multiple tables (joins across listings,
 * companies, scores, runs, ...) rather than the single-table DDL snippets
 * `write-profile-config.test.ts` uses. Applies the real Drizzle migration,
 * so the schema here can never drift from what production actually runs.
 * `dispose` is a no-op (the fake is in-memory and synchronous under the
 * hood) but kept so call sites read the same as a real async resource and
 * don't need to change if this ever moves back to a real D1 connection.
 */
export async function createTestD1(): Promise<{
  db: ReturnType<typeof getDb>;
  dispose: () => Promise<void>;
}> {
  const fakeD1 = new FakeD1Database(MIGRATION_SQL);
  // drizzle-orm/d1's own D1Database type is workers-runtime-shaped; the fake
  // only implements the subset (`prepare`/`batch`) the driver actually
  // calls, so it's cast rather than fully satisfying the ambient type.
  return { db: getDb(fakeD1 as unknown as D1Database), dispose: async () => {} };
}
