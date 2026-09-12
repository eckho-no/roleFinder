import { gte, sql } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { agentRuns } from "@/db/schema/agents";

/** Sum of `cost_estimate_usd` for agent runs created since UTC midnight today. */
export async function getTodaySpendUsd(db: ReturnType<typeof getDb>): Promise<number> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${agentRuns.costEstimateUsd}), 0)` })
    .from(agentRuns)
    .where(gte(agentRuns.createdAt, startOfDayUtc));

  return row?.total ?? 0;
}
