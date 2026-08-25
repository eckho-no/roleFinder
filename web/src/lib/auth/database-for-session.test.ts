import { describe, expect, it } from "vitest";

import { databaseForSession } from "./database-for-session";
import { newExpiry } from "./session";

const REAL_DB = { marker: "real" } as unknown as D1Database;
const DEMO_DB = { marker: "demo" } as unknown as D1Database;
const env = { DB: REAL_DB, DEMO_DB };

describe("databaseForSession", () => {
  it("returns the real DB binding for a real session", () => {
    const db = databaseForSession({ role: "real", expiresAt: newExpiry() }, env);

    expect(db).toBe(REAL_DB);
  });

  it("returns the demo DB binding for a demo session", () => {
    const db = databaseForSession({ role: "demo", expiresAt: newExpiry() }, env);

    expect(db).toBe(DEMO_DB);
  });
});
