import type { AgentName } from "./types";

// Per-agent model choice. Extraction, duplicate matching, and currency
// checks are mechanical enough for the cheap tier; scoring, chat, and
// anything routing other agents get the stronger model. See the M5 cost
// review: OpenRouter doesn't reduce Claude token cost (same underlying
// rate), so the real levers are model tier + prompt caching, both applied
// here and in InvokeAgentInput.system.
export const MODEL_BY_AGENT: Record<AgentName, string> = {
  extraction: "claude-haiku-4-5",
  duplicate_check: "claude-haiku-4-5",
  currency_check: "claude-haiku-4-5",
  scoring: "claude-sonnet-5",
  rag_chat: "claude-sonnet-5",
  web_research: "claude-sonnet-5",
  orchestrator: "claude-sonnet-5",
};

// USD per million tokens, standard (non-introductory) rates.
const PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 3, output: 15 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_PER_MTOK[model];
  if (!pricing) throw new Error(`No pricing configured for model "${model}"`);
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}
