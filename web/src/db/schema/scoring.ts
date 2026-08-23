import {
  type AnySQLiteColumn,
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { agentRuns } from "./agents";
import { createdAt, id } from "./columns";
import { companies, listings } from "./core";
import type { NoteType, RunKind, ScoredBy, Tier } from "./unions";

export interface ProfileAxis {
  id: string;
  label: string;
  description: string;
  max: number;
  weight: number;
}

export interface LocationRules {
  commutable: string[];
  notCommutable: string[];
  radiusMiles: number;
  londonRule: string;
}

export const profileConfig = sqliteTable(
  "profile_config",
  {
    id,
    version: integer("version").notNull(),
    isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
    titles: text("titles", { mode: "json" }).notNull().$type<string[]>(),
    locationRules: text("location_rules", { mode: "json" })
      .notNull()
      .$type<LocationRules>(),
    salaryFloor: integer("salary_floor").notNull(),
    salaryHardFloor: integer("salary_hard_floor").notNull(),
    positioning: text("positioning", { mode: "json" })
      .notNull()
      .$type<Record<string, unknown>>(),
    axes: text("axes", { mode: "json" }).notNull().$type<ProfileAxis[]>(),
    tierThresholds: text("tier_thresholds", { mode: "json" })
      .notNull()
      .$type<{ act: number; consider: number }>(),
    createdAt,
    createdBy: text("created_by"),
    note: text("note"),
  },
  // is_current is the "get the active config" lookup, hit on every score.
  (table) => [index("profile_config_is_current_idx").on(table.isCurrent)],
);

export const scores = sqliteTable(
  "scores",
  {
    id,
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id),
    profileConfigId: integer("profile_config_id")
      .notNull()
      .references(() => profileConfig.id),
    axes: text("axes", { mode: "json" }).notNull().$type<Record<string, number>>(),
    total: integer("total").notNull(),
    tier: text("tier").notNull().$type<Tier>(),
    scoredBy: text("scored_by").notNull().$type<ScoredBy>(),
    rationale: text("rationale"),
    confidence: real("confidence"),
    agentRunId: integer("agent_run_id").references(() => agentRuns.id),
    supersededBy: integer("superseded_by").references((): AnySQLiteColumn => scores.id),
    createdAt,
  },
  (table) => [
    index("scores_listing_id_idx").on(table.listingId),
    index("scores_profile_config_id_idx").on(table.profileConfigId),
    index("scores_agent_run_id_idx").on(table.agentRunId),
  ],
);

export const notes = sqliteTable(
  "notes",
  {
    id,
    listingId: integer("listing_id").references(() => listings.id),
    companyId: integer("company_id").references(() => companies.id),
    type: text("type").notNull().$type<NoteType>(),
    body: text("body").notNull(),
    createdBy: text("created_by").notNull().$type<ScoredBy>(),
    agentRunId: integer("agent_run_id").references(() => agentRuns.id),
    createdAt,
  },
  (table) => [
    index("notes_listing_id_idx").on(table.listingId),
    index("notes_company_id_idx").on(table.companyId),
  ],
);

export const runs = sqliteTable("runs", {
  id,
  runNumber: integer("run_number").notNull(),
  label: text("label"),
  kind: text("kind").notNull().$type<RunKind>(),
  startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  summary: text("summary"),
  source: text("source"),
  stats: text("stats", { mode: "json" }).$type<Record<string, unknown>>(),
});
