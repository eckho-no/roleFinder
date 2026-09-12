import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import * as schema from "@/db/schema";
import { agentRuns } from "@/db/schema/agents";
import { FakeD1Database } from "@/db/test-d1";
import { countHopDepth } from "./hop-depth";

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

async function insertRun(db: ReturnType<typeof testDb>, parentAgentRunId?: number) {
  const [row] = await db
    .insert(agentRuns)
    .values({
      agentName: "orchestrator",
      model: "claude-sonnet-5",
      status: "ok",
      parentAgentRunId,
      createdAt: new Date(),
    })
    .returning({ id: agentRuns.id });
  return row.id;
}

describe("countHopDepth", () => {
  it("is 0 with no parent", async () => {
    const db = testDb();
    expect(await countHopDepth(db, undefined)).toBe(0);
  });

  it("is 1 for a single parent with no grandparent", async () => {
    const db = testDb();
    const root = await insertRun(db);
    expect(await countHopDepth(db, root)).toBe(1);
  });

  it("counts the full chain back to the root", async () => {
    const db = testDb();
    const root = await insertRun(db);
    const child = await insertRun(db, root);
    const grandchild = await insertRun(db, child);

    expect(await countHopDepth(db, grandchild)).toBe(3);
  });

  it("stops at a parent id that doesn't exist rather than looping", async () => {
    const db = testDb();
    expect(await countHopDepth(db, 9999)).toBe(1);
  });
});
