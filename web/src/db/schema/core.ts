import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt, id, updatedAt } from "./columns";
import { runs } from "./scoring";
import type {
  DeadlineSource,
  EmbeddingStatus,
  ListingStatus,
  LinkType,
  Outcome,
  RemoteType,
  SalaryPeriod,
  Source,
  Triage,
} from "./unions";

export const companies = sqliteTable("companies", {
  id,
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  domainFlag: integer("domain_flag", { mode: "boolean" }).notNull().default(false),
  domainNote: text("domain_note"),
  careersUrl: text("careers_url"),
  notes: text("notes"),
  createdAt,
  updatedAt,
});

export const queries = sqliteTable(
  "queries",
  {
    id,
    text: text("text").notNull(),
    source: text("source").notNull().$type<Source>(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    addedInRunId: integer("added_in_run_id").references(() => runs.id),
    retiredInRunId: integer("retired_in_run_id").references(() => runs.id),
    notes: text("notes"),
    createdAt,
  },
  (table) => [
    index("queries_added_in_run_id_idx").on(table.addedInRunId),
    index("queries_retired_in_run_id_idx").on(table.retiredInRunId),
  ],
);

export const listings = sqliteTable(
  "listings",
  {
    id,
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id),
    title: text("title").notNull(),
    url: text("url"),
    linkType: text("link_type").notNull().$type<LinkType>(),
    source: text("source").notNull().$type<Source>(),
    sourceRef: text("source_ref"),
    location: text("location"),
    remoteType: text("remote_type").notNull().$type<RemoteType>(),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: text("salary_period").$type<SalaryPeriod>(),
    salaryStated: integer("salary_stated", { mode: "boolean" }).notNull().default(false),
    postedDate: integer("posted_date", { mode: "timestamp" }),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    deadlineSource: text("deadline_source").notNull().$type<DeadlineSource>(),
    status: text("status").notNull().$type<ListingStatus>(),
    triage: text("triage").notNull().$type<Triage>(),
    statusConfirmedAt: integer("status_confirmed_at", { mode: "timestamp" }),
    firstSeenAt: integer("first_seen_at", { mode: "timestamp" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
    sightingCount: integer("sighting_count").notNull().default(0),
    outcome: text("outcome").notNull().$type<Outcome>().default("none"),
    outcomeAt: integer("outcome_at", { mode: "timestamp" }),
    rawText: text("raw_text"),
    embeddingStatus: text("embedding_status")
      .notNull()
      .$type<EmbeddingStatus>()
      .default("pending"),
    embeddedAt: integer("embedded_at", { mode: "timestamp" }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("listings_company_id_idx").on(table.companyId),
    // Dashboard filters by these constantly (deadline rail, tier/status/triage
    // filters per PLAN_2.0.md M4) — unindexed means a full table scan per view.
    index("listings_status_idx").on(table.status),
    index("listings_triage_idx").on(table.triage),
    index("listings_expires_at_idx").on(table.expiresAt),
  ],
);

export const sightings = sqliteTable(
  "sightings",
  {
    id,
    listingId: integer("listing_id")
      .notNull()
      .references(() => listings.id),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id),
    queryId: integer("query_id").references(() => queries.id),
    source: text("source").notNull().$type<Source>(),
    seenAt: integer("seen_at", { mode: "timestamp" }).notNull(),
    rawSnippet: text("raw_snippet"),
  },
  (table) => [
    index("sightings_listing_id_idx").on(table.listingId),
    index("sightings_run_id_idx").on(table.runId),
    index("sightings_query_id_idx").on(table.queryId),
  ],
);
