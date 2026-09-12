import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { agentRuns } from "@/db/schema/agents";
import type { AgentRunStatus } from "@/db/schema/unions";
import { FakeD1Database } from "@/db/test-d1";
import { getTodaySpendUsd } from "./agent-spend";

const AGENT_RUNS_DDL = `
CREATE TABLE agent_runs (
  id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  run_id integer,
  listing_id integer,
  agent_name text NOT NULL,
  agent_version text,
  prompt_version text,
  parent_agent_run_id integer,
  model text NOT NULL,
  input text,
  output text,
  input_tokens integer,
  output_tokens integer,
  cost_estimate_usd real,
  latency_ms integer,
  status text NOT NULL,
  error text,
  created_at integer NOT NULL
);
`;

function testDb() {
  const fakeD1 = new FakeD1Database(AGENT_RUNS_DDL);
  return drizzle(fakeD1 as unknown as D1Database, { schema });
}

async function insertRun(
  db: ReturnType<typeof testDb>,
  overrides: { costEstimateUsd?: number | null; createdAt?: Date; status?: AgentRunStatus } = {},
) {
  await db.insert(agentRuns).values({
    agentName: "extraction",
    model: "claude-haiku-4-5",
    status: overrides.status ?? "ok",
    // `??` would substitute 0.01 for an explicit `null` override too — use
    // `in` so a caller testing "null cost" actually inserts null.
    costEstimateUsd: "costEstimateUsd" in overrides ? overrides.costEstimateUsd : 0.01,
    createdAt: overrides.createdAt ?? new Date(),
  });
}

describe("getTodaySpendUsd", () => {
  it("returns 0 with no rows", async () => {
    const db = testDb();
    expect(await getTodaySpendUsd(db)).toBe(0);
  });

  it("sums cost_estimate_usd for rows created today", async () => {
    const db = testDb();
    await insertRun(db, { costEstimateUsd: 0.01 });
    await insertRun(db, { costEstimateUsd: 0.02 });

    expect(await getTodaySpendUsd(db)).toBeCloseTo(0.03, 8);
  });

  it("excludes rows created before today", async () => {
    const db = testDb();
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await insertRun(db, { costEstimateUsd: 0.5, createdAt: yesterday });
    await insertRun(db, { costEstimateUsd: 0.01 });

    expect(await getTodaySpendUsd(db)).toBeCloseTo(0.01, 8);
  });

  it("treats a null cost_estimate_usd (e.g. a budget_denied row) as zero", async () => {
    const db = testDb();
    await insertRun(db, { costEstimateUsd: null, status: "budget_denied" });
    await insertRun(db, { costEstimateUsd: 0.01 });

    expect(await getTodaySpendUsd(db)).toBeCloseTo(0.01, 8);
  });
});
