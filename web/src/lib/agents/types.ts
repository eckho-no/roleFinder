import type { AgentRunStatus } from "@/db/schema/unions";

// One entry per agent the dispatcher knows how to route. Extending the
// pipeline (PLAN.md's orchestrator/web-research hops) means adding a name
// here and a model in pricing.ts — not a new dispatcher.
export const agentNames = [
  "extraction",
  "scoring",
  "duplicate_check",
  "currency_check",
  "rag_chat",
  "web_research",
  "orchestrator",
] as const;
export type AgentName = (typeof agentNames)[number];

export type AnthropicSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export interface InvokeAgentInput {
  // Array form lets a caller mark the stable portion of its prompt (a
  // rubric, an extraction schema) with cache_control so repeat calls read
  // from cache instead of reprocessing it at full price.
  system?: string | AnthropicSystemBlock[];
  messages: { role: "user" | "assistant"; content: string }[];
  maxTokens?: number;
  promptVersion?: string;
}

export interface InvokeAgentOptions {
  runId?: number;
  listingId?: number;
  parentAgentRunId?: number;
}

export interface InvokeAgentResult {
  agentRunId: number;
  status: AgentRunStatus;
  output?: { text: string } | null;
  error?: string;
}
