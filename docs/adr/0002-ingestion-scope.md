# ADR-0002: Indeed/LinkedIn are paste-in; Adzuna/Reed are automated

**Status:** accepted
**Date:** 2026-08-19

## Context

The workflow this app replaces pulls listings from five sources: Indeed
searches, a Gmail alert sweep (which itself aggregates LinkedIn, Reed,
CV-Library, Totaljobs, and Adzuna alert emails), and manual finds. An
ingestion design has to decide, per source, whether the app fetches and
parses it automatically or whether a human pastes in the raw text.

## Decision

- **Adzuna** and **Reed** get real, automated ingestion: a scheduled Cron
  Trigger calls their public search APIs (§8 of PLAN_2.0.md), producing
  `pending_review` listing rows.
- **Everything else — Indeed, LinkedIn, and any other source — stays
  paste-in.** A human pastes a job description; the extraction agent (M5)
  structures it into the same schema automated listings land in.

## Alternatives considered

- **Scrape Indeed and LinkedIn directly.** Both are structurally hostile to
  this: no public search API, ToS terms that prohibit automated scraping,
  and active anti-bot measures on a hosted Worker's IP range. Doing this
  from a deployed Cloudflare Worker — a shared, identifiable IP space — is
  both a ToS violation and likely to get the deploying account's other
  Cloudflare services flagged. Rejected outright, not just deprioritised.
- **Use a third-party job-aggregator API that re-exposes Indeed/LinkedIn
  data.** These exist but are commercial products with their own terms,
  cost, and reliability risk, and would make the ingestion pipeline
  dependent on a vendor whose access to the underlying sites could change
  or disappear. Not worth it for a single-user tool when paste-in already
  works today.
- **Build nothing automated, keep everything paste-in.** Simpler, but
  throws away the two sources (Adzuna, Reed) that have legitimate free APIs
  and already produce real signal in the Gmail sweep — the whole point of
  M8 is to stop hand-copying what's mechanically fetchable.

## Consequences

- The extraction agent has to handle both paths through one schema —
  automated `pending_review` rows from Adzuna/Reed and manually pasted
  drafts from Indeed/LinkedIn look identical downstream, which was a design
  goal, not an accident.
- `listings.source` + `listings.source_ref` accommodate a future legitimate
  feed (e.g. an official Indeed Publisher feed, if one is ever obtained)
  without a schema change — automate the extraction, not the acquisition,
  is the standing principle, not just today's constraint.
- Coverage of Indeed/LinkedIn — historically the highest-volume sources —
  stays bottlenecked on a human pasting JDs. This is accepted, not treated
  as a gap to close later; the alternative is a ToS violation.
