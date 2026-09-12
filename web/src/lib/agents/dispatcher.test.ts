import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { agentRuns } from "@/db/schema/agents";
import { FakeD1Database } from "@/db/test-d1";

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}));

const { getCloudflareContext } = await import("@opennextjs/cloudflare");
const { invokeAgent } = await import("./dispatcher");

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

/**
 * One in-memory D1 fake backs both `fakeD1` (handed to the dispatcher as
 * `env.DB`, which wraps it in its own Drizzle instance) and `db` (this
 * test's own Drizzle instance, used only to assert on the rows the
 * dispatcher wrote) — same underlying `node:sqlite` database either way.
 */
function testDb() {
  const fakeD1 = new FakeD1Database(AGENT_RUNS_DDL);
  const db = drizzle(fakeD1 as unknown as D1Database, { schema });
  return { fakeD1, db };
}

function mockEnv(fakeD1: FakeD1Database, overrides: Record<string, string> = {}) {
  vi.mocked(getCloudflareContext).mockResolvedValue({
    env: {
      DB: fakeD1 as unknown as D1Database,
      ANTHROPIC_API_KEY: "test-key",
      AGENT_MAX_HOPS: "8",
      AGENT_DAILY_BUDGET_USD: "5",
      ...overrides,
    } as unknown as CloudflareEnv,
    cf: undefined as never,
    ctx: {} as ExecutionContext,
  });
}

function mockAnthropicResponse(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

const SUCCESS_BODY = {
  content: [{ type: "text", text: "hello from claude" }],
  usage: { input_tokens: 100, output_tokens: 50 },
};

describe("invokeAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls Anthropic and logs an ok row with tokens, cost, and latency", async () => {
    const { fakeD1, db } = testDb();
    mockEnv(fakeD1);
    mockAnthropicResponse(SUCCESS_BODY);

    const result = await invokeAgent("extraction", {
      messages: [{ role: "user", content: "extract this" }],
    });

    expect(result.status).toBe("ok");
    expect(result.output).toEqual({ text: "hello from claude" });

    const rows = await db.select().from(agentRuns);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      agentName: "extraction",
      model: "claude-haiku-4-5",
      inputTokens: 100,
      outputTokens: 50,
      status: "ok",
    });
    expect(rows[0].latencyMs).toBeGreaterThanOrEqual(0);
    // 100/1e6 * $1 (haiku input) + 50/1e6 * $5 (haiku output)
    expect(rows[0].costEstimateUsd).toBeCloseTo(0.00035, 8);
  });

  it("picks the stronger model for scoring than for extraction", async () => {
    const { fakeD1, db } = testDb();
    mockEnv(fakeD1);
    mockAnthropicResponse(SUCCESS_BODY);

    await invokeAgent("scoring", { messages: [{ role: "user", content: "score this" }] });

    const [row] = await db.select().from(agentRuns);
    expect(row.model).toBe("claude-sonnet-5");
  });

  it("logs a non-2xx Anthropic response as status error without throwing", async () => {
    const { fakeD1, db } = testDb();
    mockEnv(fakeD1);
    mockAnthropicResponse({ error: { message: "bad request" } }, 400);

    const result = await invokeAgent("extraction", {
      messages: [{ role: "user", content: "x" }],
    });

    expect(result.status).toBe("error");
    const [row] = await db.select().from(agentRuns);
    expect(row.status).toBe("error");
    expect(row.error).toContain("400");
  });

  it("denies without calling Anthropic once today's spend meets the budget cap", async () => {
    const { fakeD1, db } = testDb();
    mockEnv(fakeD1, { AGENT_DAILY_BUDGET_USD: "0.0001" });
    const fetchSpy = vi.fn(
      async () => new Response(JSON.stringify(SUCCESS_BODY), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    // First call spends past the cap ($0.00035 > $0.0001).
    await invokeAgent("extraction", { messages: [{ role: "user", content: "one" }] });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const result = await invokeAgent("extraction", {
      messages: [{ role: "user", content: "two" }],
    });

    expect(result.status).toBe("budget_denied");
    expect(fetchSpy).toHaveBeenCalledTimes(1); // not called a second time

    const rows = await db.select().from(agentRuns);
    expect(rows).toHaveLength(2);
    expect(rows[1].status).toBe("budget_denied");
    expect(rows[1].model).toBeTruthy(); // still records which model would have run
  });

  it("denies once the hop chain exceeds the configured max", async () => {
    const { fakeD1 } = testDb();
    mockEnv(fakeD1, { AGENT_MAX_HOPS: "2" });
    mockAnthropicResponse(SUCCESS_BODY);

    const hop1 = await invokeAgent("orchestrator", { messages: [{ role: "user", content: "1" }] });
    expect(hop1.status).toBe("ok");
    const hop2 = await invokeAgent(
      "web_research",
      { messages: [{ role: "user", content: "2" }] },
      { parentAgentRunId: hop1.agentRunId },
    );
    expect(hop2.status).toBe("ok");

    const hop3 = await invokeAgent(
      "scoring",
      { messages: [{ role: "user", content: "3" }] },
      { parentAgentRunId: hop2.agentRunId },
    );

    expect(hop3.status).toBe("error");
    expect(hop3.error).toContain("Hop limit exceeded");
  });

  it("logs status timeout when the request aborts", async () => {
    const { fakeD1, db } = testDb();
    mockEnv(fakeD1);
    function abortError() {
      const err = new Error("aborted");
      err.name = "AbortError";
      return err;
    }
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            // The stubbed setTimeout below fires synchronously, before
            // this executor's addEventListener call — so by the time
            // fetch() runs, the signal is already aborted and the 'abort'
            // event has already fired. Check the already-aborted case
            // directly rather than relying on the event alone (matching
            // real fetch's own already-aborted-signal behavior).
            if (init.signal?.aborted) {
              reject(abortError());
              return;
            }
            init.signal?.addEventListener("abort", () => reject(abortError()));
          }),
      ),
    );
    // Fire the abort immediately instead of waiting the real timeout.
    vi.stubGlobal("setTimeout", ((fn: () => void) => {
      fn();
      return 0;
    }) as typeof setTimeout);

    const result = await invokeAgent("extraction", {
      messages: [{ role: "user", content: "x" }],
    });

    expect(result.status).toBe("timeout");
    const [row] = await db.select().from(agentRuns);
    expect(row.status).toBe("timeout");
  });
});
