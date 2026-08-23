import { z } from "zod";

// D1 has no native enums — every union field is a TEXT column. Each of
// these pairs a Zod schema (the boundary validator) with the TypeScript
// type Drizzle's column definitions cast to via `.$type<...>()`.

export const sourceValues = [
  "indeed",
  "adzuna",
  "reed",
  "gmail_alert",
  "manual",
] as const;
export const sourceSchema = z.enum(sourceValues);
export type Source = z.infer<typeof sourceSchema>;

export const linkTypeValues = ["stable", "short_lived", "third_party"] as const;
export const linkTypeSchema = z.enum(linkTypeValues);
export type LinkType = z.infer<typeof linkTypeSchema>;

export const remoteTypeValues = ["remote", "hybrid", "onsite", "unknown"] as const;
export const remoteTypeSchema = z.enum(remoteTypeValues);
export type RemoteType = z.infer<typeof remoteTypeSchema>;

export const salaryPeriodValues = ["year", "month", "day", "hour"] as const;
export const salaryPeriodSchema = z.enum(salaryPeriodValues);
export type SalaryPeriod = z.infer<typeof salaryPeriodSchema>;

export const deadlineSourceValues = ["stated", "inferred", "none"] as const;
export const deadlineSourceSchema = z.enum(deadlineSourceValues);
export type DeadlineSource = z.infer<typeof deadlineSourceSchema>;

export const listingStatusValues = ["live", "closed", "expired", "unknown"] as const;
export const listingStatusSchema = z.enum(listingStatusValues);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const triageValues = [
  "pending_review",
  "scored",
  "logged_only",
  "rejected",
  "merged",
] as const;
export const triageSchema = z.enum(triageValues);
export type Triage = z.infer<typeof triageSchema>;

export const outcomeValues = [
  "none",
  "applied",
  "responded",
  "interviewed",
  "offered",
  "rejected",
  "ghosted",
] as const;
export const outcomeSchema = z.enum(outcomeValues);
export type Outcome = z.infer<typeof outcomeSchema>;

export const embeddingStatusValues = ["pending", "ok", "failed"] as const;
export const embeddingStatusSchema = z.enum(embeddingStatusValues);
export type EmbeddingStatus = z.infer<typeof embeddingStatusSchema>;

export const tierValues = ["act", "consider", "skip"] as const;
export const tierSchema = z.enum(tierValues);
export type Tier = z.infer<typeof tierSchema>;

export const scoredByValues = ["manual", "agent"] as const;
export const scoredBySchema = z.enum(scoredByValues);
export type ScoredBy = z.infer<typeof scoredBySchema>;

export const noteTypeValues = [
  "currency_check",
  "duplicate_flag",
  "judgment_call",
  "application_log",
  "process_note",
  "deadline",
  "contact",
] as const;
export const noteTypeSchema = z.enum(noteTypeValues);
export type NoteType = z.infer<typeof noteTypeSchema>;

export const runKindValues = ["full", "sweep", "manual", "cron"] as const;
export const runKindSchema = z.enum(runKindValues);
export type RunKind = z.infer<typeof runKindSchema>;

export const agentRunStatusValues = ["ok", "error", "timeout", "budget_denied"] as const;
export const agentRunStatusSchema = z.enum(agentRunStatusValues);
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>;

export const duplicateMethodValues = ["fuzzy", "vector", "manual"] as const;
export const duplicateMethodSchema = z.enum(duplicateMethodValues);
export type DuplicateMethod = z.infer<typeof duplicateMethodSchema>;

export const duplicateStatusValues = ["suspected", "confirmed", "dismissed"] as const;
export const duplicateStatusSchema = z.enum(duplicateStatusValues);
export type DuplicateStatus = z.infer<typeof duplicateStatusSchema>;

export const reflectionStatusValues = ["open", "answered", "skipped"] as const;
export const reflectionStatusSchema = z.enum(reflectionStatusValues);
export type ReflectionStatus = z.infer<typeof reflectionStatusSchema>;
