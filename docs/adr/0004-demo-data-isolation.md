# ADR-0004: Separate D1 database for demo data, not a flag column

**Status:** accepted
**Date:** 2026-08-24

## Context

PLAN_2.0.md's M3 section names a requirement — "Demo mode: `DEMO_PASSWORD`
issues a read-only session over the synthetic board" — but never specifies
the isolation mechanism. Neither does §4's data model: every table is
defined once, with no column distinguishing "real board" rows from "demo
board" rows.

This surfaced as a concrete problem during M2, not a hypothetical one:
`rolefinder-db` held the committed synthetic fixture (seeded for issue #17),
and converting the real tracker (issue #18) produced rows with the same
primary keys, in the same tables, in the same database — an immediate
insert conflict, and, underneath that, the real question this ADR answers.

## Decision

Two separate D1 databases: `rolefinder-db` (real data only) and
`rolefinder-demo-db` (synthetic fixture only), bound as `DB` and `DEMO_DB`
in `wrangler.jsonc`. Both get the same migration applied. A demo session
(M3) reads from `env.DEMO_DB`; a real session reads from `env.DB`. There is
no code path that can select the wrong one at query time, because there is
no shared table to filter — the isolation is which *connection* a request
holds, decided once at session-resolution time, not re-checked per query.

## Alternatives considered

- **A boolean `is_demo` column on every table, single database.** The
  obvious alternative, and rejected specifically because of the failure
  mode it invites: every future query against `listings`, `scores`,
  `companies`, etc. has to remember to filter by session type. Forget one
  `WHERE is_demo = 0` and a demo session reads real data — a salary floor,
  a home address, real company names — through a URL anyone can reach with
  the public demo password. A missing filter is a code review problem; a
  wrong database binding a request never had access to isn't reachable at
  all. The cost is symmetric with ADR-0003's whole argument: prefer a
  boundary an oversight can't cross over one a query has to remember to
  enforce.
- **A tenant/workspace ID column instead of a boolean.** Same shape of risk
  as `is_demo`, just generalized. Doesn't change the core problem: it's
  still a per-query discipline requirement instead of a structural one.
- **Single database, demo mode computed at read time from a curated
  subset of real listings (redacted).** Rejected outright — redaction is
  exactly the "delete a file, but it's still in history" failure mode
  applied to a database instead of git: a redaction bug or a forgotten
  field leaks real data through the "demo" path. The synthetic fixture
  exists precisely so nothing real ever has to be reachable from demo mode,
  full stop.

## Consequences

- Every future migration has to be applied to both databases —
  `rolefinder-db` and `rolefinder-demo-db` — not just one. `scripts/seed.mjs`
  already takes a `--db` flag for this; migration tooling should follow the
  same pattern rather than hardcoding `rolefinder-db`.
- M3's session logic picks a binding (`env.DB` vs `env.DEMO_DB`) once,
  based on which password was used to log in, and every subsequent query in
  that request uses that binding — this needs to be a deliberate part of
  the session/request-context design, not bolted on per-route.
- Slightly more Cloudflare-side setup (two D1 databases instead of one),
  which is free-tier-cheap and one-time, against a security property that
  holds regardless of future query-writing discipline.
