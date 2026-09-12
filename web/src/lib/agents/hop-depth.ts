import { eq } from "drizzle-orm";
import type { getDb } from "@/db/client";
import { agentRuns } from "@/db/schema/agents";

// Hard ceiling independent of AGENT_MAX_HOPS — a misconfigured or
// corrupted parent chain must not turn this into an unbounded DB walk.
const ABSOLUTE_MAX_LOOKUPS = 50;

/**
 * Counts hops from `parentAgentRunId` up to the root of its call chain by
 * walking `parent_agent_run_id`. Computed server-side from the DB rather
 * than trusting a caller-supplied depth, so a caller can't (accidentally
 * or otherwise) under-report how deep a chain already is.
 */
export async function countHopDepth(
  db: ReturnType<typeof getDb>,
  parentAgentRunId: number | undefined,
): Promise<number> {
  let depth = 0;
  let currentId = parentAgentRunId;

  while (currentId !== undefined && depth < ABSOLUTE_MAX_LOOKUPS) {
    depth += 1;
    const [row] = await db
      .select({ parentAgentRunId: agentRuns.parentAgentRunId })
      .from(agentRuns)
      .where(eq(agentRuns.id, currentId));
    if (!row) break;
    currentId = row.parentAgentRunId ?? undefined;
  }

  return depth;
}
