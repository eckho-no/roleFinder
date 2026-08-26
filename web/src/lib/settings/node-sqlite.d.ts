// Minimal ambient types for `node:sqlite`, test-only. This project's
// `@types/node` is pinned to v20 (matching the Workers runtime, not the
// local Node version) which predates `node:sqlite`'s official types
// (added in @types/node v22) — this declares just the subset test-d1.ts
// actually calls rather than pulling in a newer @types/node for one
// experimental built-in used only in tests.
declare module "node:sqlite" {
  export interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): StatementResultingChanges;
  }

  export class DatabaseSync {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
