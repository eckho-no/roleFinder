import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { createdAt, id } from "./columns";
import { listings } from "./core";
import { runs } from "./scoring";
import type { AgentRunStatus, DuplicateMethod, DuplicateStatus, ReflectionStatus } from "./unions";

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id,
    runId: integer("run_id").references((): AnySQLiteColumn => runs.id),
    listingId: integer("listing_id").references(() => listings.id),
    agentName: text("agent_name").notNull(),
    agentVersion: text("agent_version"),
    promptVersion: text("prompt_version"),
    parentAgentRunId: integer("parent_agent_run_id").references(
      (): AnySQLiteColumn => agentRuns.id,
    ),
    model: text("model").notNull(),
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
    output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costEstimateUsd: real("cost_estimate_usd"),
    latencyMs: integer("latency_ms"),
    status: text("status").notNull().$type<AgentRunStatus>(),
    error: text("error"),
    createdAt,
  },
  (table) => [
    index("agent_runs_run_id_idx").on(table.runId),
    index("agent_runs_listing_id_idx").on(table.listingId),
    // Walks the call tree (a parent's children) — see PLAN_2.0.md's trace panel.
    index("agent_runs_parent_agent_run_id_idx").on(table.parentAgentRunId),
  ],
);

export const duplicates = sqliteTable(
  "duplicates",
  {
    id,
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id),
    duplicateOfListingId: integer("duplicate_of_listing_id")
      .notNull()
      .references(() => listings.id),
    method: text("method").notNull().$type<DuplicateMethod>(),
    similarity: real("similarity"),
    status: text("status").notNull().$type<DuplicateStatus>(),
    agentRunId: integer("agent_run_id").references((): AnySQLiteColumn => agentRuns.id),
    createdAt,
  },
  (table) => [
    index("duplicates_listing_id_idx").on(table.listingId),
    index("duplicates_duplicate_of_listing_id_idx").on(table.duplicateOfListingId),
  ],
);

export const reflections = sqliteTable("reflections", {
  id,
  question: text("question").notNull(),
  context: text("context", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status").notNull().$type<ReflectionStatus>().default("open"),
  answer: text("answer"),
  proposedConfigDiff: text("proposed_config_diff", { mode: "json" }).$type<
    Record<string, unknown>
  >(),
  sampleSize: integer("sample_size").notNull(),
  createdAt,
  answeredAt: integer("answered_at", { mode: "timestamp" }),
  agentRunId: integer("agent_run_id").references((): AnySQLiteColumn => agentRuns.id),
});
