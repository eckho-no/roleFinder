import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getDb } from "@/db/client";
import { agentRuns } from "@/db/schema/agents";
import { getTodaySpendUsd } from "@/db/queries/agent-spend";
import { countHopDepth } from "./hop-depth";
import { estimateCostUsd, MODEL_BY_AGENT } from "./pricing";
import type { AgentName, InvokeAgentInput, InvokeAgentOptions, InvokeAgentResult } from "./types";

const DEFAULT_MAX_HOPS = 8;
const DEFAULT_DAILY_BUDGET_USD = 5;
const DEFAULT_MAX_TOKENS = 4096;
const REQUEST_TIMEOUT_MS = 55_000; // stay under the Workers request ceiling

interface AnthropicMessagesResponse {
  content: { type: string; text?: string }[];
  usage: { input_tokens: number; output_tokens: number };
}

async function callAnthropic(params: {
  apiKey: string;
  model: string;
  system: InvokeAgentInput["system"];
  messages: InvokeAgentInput["messages"];
  maxTokens: number;
}): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    // Only fetch call to the Anthropic API in the app — enforced by the
    // no-restricted-syntax rule in eslint.config.mjs (issue #30: "direct
    // Anthropic fetch outside the dispatcher fails lint").
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": params.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens,
        system: params.system,
        messages: params.messages,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  const text = data.content.find((block) => block.type === "text")?.text ?? "";
  return { text, inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens };
}

/**
 * The one place that calls Claude. Every agent invocation — extraction,
 * scoring, RAG chat, currency/duplicate checks, and the orchestrator that
 * calls them as tools — goes through here so model choice, cost logging,
 * hop limits, and the daily budget cap are enforced in exactly one spot
 * (see docs/PLAN.md's "Agent orchestration" section and issues #30/#31).
 */
export async function invokeAgent(
  name: AgentName,
  input: InvokeAgentInput,
  opts: InvokeAgentOptions = {},
): Promise<InvokeAgentResult> {
  const { env } = await getCloudflareContext({ async: true });
  // Agent invocations always write to the real board. A demo (read-only)
  // session can never reach this function in the first place — every
  // write/agent route requires `requireWritableSession`, which rejects
  // demo sessions before invokeAgent is ever called — so there's no
  // session to resolve a binding from here.
  const db = getDb(env.DB);
  const model = MODEL_BY_AGENT[name];
  // The `agent_runs.input` column is a generic JSON blob (`Record<string,
  // unknown>`) — InvokeAgentInput is a specific shape without an index
  // signature, so it's cast rather than widened at the type level.
  const inputJson = input as unknown as Record<string, unknown>;

  const maxHops = Number(env.AGENT_MAX_HOPS) || DEFAULT_MAX_HOPS;
  const hopDepth = await countHopDepth(db, opts.parentAgentRunId);
  if (hopDepth + 1 > maxHops) {
    const [row] = await db
      .insert(agentRuns)
      .values({
        runId: opts.runId,
        listingId: opts.listingId,
        agentName: name,
        parentAgentRunId: opts.parentAgentRunId,
        model,
        input: inputJson,
        promptVersion: input.promptVersion,
        status: "error",
        error: `Hop limit exceeded (max ${maxHops})`,
      })
      .returning({ id: agentRuns.id });
    return { agentRunId: row.id, status: "error", error: `Hop limit exceeded (max ${maxHops})` };
  }

  const dailyBudgetUsd = Number(env.AGENT_DAILY_BUDGET_USD) || DEFAULT_DAILY_BUDGET_USD;
  const spentToday = await getTodaySpendUsd(db);
  if (spentToday >= dailyBudgetUsd) {
    // "budget_denied without calling out" (#31) — no Anthropic request is
    // made at all, so a runaway loop can't spend past the cap.
    const [row] = await db
      .insert(agentRuns)
      .values({
        runId: opts.runId,
        listingId: opts.listingId,
        agentName: name,
        parentAgentRunId: opts.parentAgentRunId,
        model,
        input: inputJson,
        promptVersion: input.promptVersion,
        status: "budget_denied",
      })
      .returning({ id: agentRuns.id });
    return { agentRunId: row.id, status: "budget_denied" };
  }

  const startedAt = Date.now();
  try {
    const { text, inputTokens, outputTokens } = await callAnthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      model,
      system: input.system,
      messages: input.messages,
      maxTokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
    });
    const latencyMs = Date.now() - startedAt;
    const costEstimateUsd = estimateCostUsd(model, inputTokens, outputTokens);

    const [row] = await db
      .insert(agentRuns)
      .values({
        runId: opts.runId,
        listingId: opts.listingId,
        agentName: name,
        parentAgentRunId: opts.parentAgentRunId,
        model,
        input: inputJson,
        output: { text },
        promptVersion: input.promptVersion,
        inputTokens,
        outputTokens,
        costEstimateUsd,
        latencyMs,
        status: "ok",
      })
      .returning({ id: agentRuns.id });
    return { agentRunId: row.id, status: "ok", output: { text } };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const isTimeout = error instanceof Error && error.name === "AbortError";
    const message = error instanceof Error ? error.message : String(error);

    const [row] = await db
      .insert(agentRuns)
      .values({
        runId: opts.runId,
        listingId: opts.listingId,
        agentName: name,
        parentAgentRunId: opts.parentAgentRunId,
        model,
        input: inputJson,
        promptVersion: input.promptVersion,
        latencyMs,
        status: isTimeout ? "timeout" : "error",
        error: message,
      })
      .returning({ id: agentRuns.id });
    return { agentRunId: row.id, status: isTimeout ? "timeout" : "error", error: message };
  }
}
