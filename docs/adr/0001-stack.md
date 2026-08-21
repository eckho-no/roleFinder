# ADR-0001: Next.js + OpenNext + D1 + Drizzle

**Status:** accepted
**Date:** 2026-08-19

## Context

roleFinder needs a small gated app: server-rendered pages, a handful of API
routes, scheduled jobs, and several outbound calls to the Anthropic API and
Cloudflare's own AI/vector services. It replaces a hand-maintained markdown
tracker for one user, but is explicitly a portfolio piece, so the stack
choice is also a legibility choice — it should read as a deliberate,
defensible set of trade-offs, not just "whatever runs."

Candidates considered together, since they're coupled: hosting platform,
web framework, database, and ORM.

## Decision

- **Hosting:** Cloudflare Workers, via `@opennextjs/cloudflare`.
- **Framework:** Next.js (App Router).
- **Database:** Cloudflare D1 (SQLite), via **Drizzle ORM**.

Cloudflare over a traditional Node host: Queues, Cron Triggers, KV, D1,
Vectorize, and Workers AI are all needed (§4/§5 of PLAN_2.0.md), and having
them as bindings in one platform beats stitching together five vendors.
OpenNext is the current, actively maintained path to run Next.js on Workers.

Drizzle over Prisma specifically because of the Workers constraint: Prisma's
query engine is a native binary, which doesn't run in a Workers isolate
without extra tooling (Data Proxy or WASM engine, both added complexity and
latency). Drizzle has no query-engine process — it compiles to plain SQL —
which means a faster cold start and `drizzle-kit` generating SQL that
`wrangler d1 migrations apply` consumes directly, no translation layer.

## Alternatives considered

- **Vercel + Postgres (Neon/Supabase) + Prisma.** The default choice for a
  Next.js app, and it would work. Rejected because it doesn't need any of
  Cloudflare's adjacent primitives (Queues, Vectorize, Workers AI, KV,
  Cron), so it would mean paying for a second vendor's equivalents or doing
  without. It's also a less interesting portfolio story — "Next.js on
  Vercel" says less than "Next.js on Workers via OpenNext" about willingness
  to work through platform constraints.
- **Prisma on Workers via Data Proxy.** Works, but adds a hosted proxy
  dependency and network hop for every query, which is the wrong trade-off
  for a low-traffic single-user app where cold-start latency matters more
  than Prisma's DX advantages.
- **Raw `D1.prepare()` with no ORM.** Considered for simplicity given the
  schema isn't huge. Rejected because the schema has enough FKs, JSON
  columns and unions (§4) that hand-written SQL would either lose type
  safety or reinvent a thin ORM anyway.

## Consequences

- OpenNext-on-Workers is a fast-moving target — version pinning and a
  Phase-1 (M1) version check are required before scaffolding, and the
  lockfile is committed.
- No Prisma Studio-equivalent GUI out of the box; `drizzle-kit studio` or
  direct `wrangler d1 execute` cover local inspection instead.
- D1 has no native enums (SQLite), which cascades into a project-wide rule:
  every union field is TEXT plus a TypeScript union and a boundary
  validator — see ADR consequences reflected in the schema, PLAN_2.0.md §4.

## Versions verified (2026-08-20, M1 issue #7)

Checked against npm and each project's own docs before scaffolding:

| Package | Version | Notes |
|---|---|---|
| `next` | 16.3.1 | Next.js 14 support from OpenNext ends Q1 2026 — 16 is the only sane choice now |
| `@opennextjs/cloudflare` | 1.20.2 | Reached 1.0 GA in February 2026 |
| `wrangler` | 4.124.0 | |
| `drizzle-orm` | 0.45.2 | Not installed until M2; version recorded here so the M2 check starts from a known baseline |
| `drizzle-kit` | 0.31.10 | Same — not installed until M2 |

**Breaking changes / constraints affecting this plan:**

- **"Node Middleware"** (the Next.js 15.2+ feature that runs `middleware.ts`
  in the Node.js runtime instead of Edge) **is not yet supported** by
  `@opennextjs/cloudflare`. Not a blocker — PLAN_2.0.md's auth design
  (§5 M3) already assumes standard Edge-runtime middleware plus Web Crypto,
  not Node APIs in middleware, so this constraint matches the existing plan
  rather than changing it.
- **Worker size limits apply to the compressed bundle**: 3 MiB on the free
  plan, 10 MiB on paid. Worth watching from M5 onward once Anthropic
  SDK-adjacent code and agent logic land — direct `fetch` to the Anthropic
  API (already the plan, §2) avoids pulling in the Node SDK, which helps
  here too.
- **Drizzle's `db.transaction()` doesn't work against D1** — D1 doesn't
  support the multi-statement `BEGIN TRANSACTION` semantics Drizzle's
  transaction API assumes; `db.batch()` is the D1-compatible alternative
  for atomic multi-statement writes. Relevant from M2 onward: the schema's
  append-only writes (scores, sightings, notes) are mostly single-row
  inserts, so this is unlikely to bite, but any M2/M5 code doing a
  multi-table write in one operation needs `db.batch()`, not
  `db.transaction()`.
- `compatibility_date` in `wrangler.jsonc` must be set to the scaffold date
  or later, and `compatibility_flags: ["nodejs_compat"]` is required —
  both are set automatically by the `create-cloudflare` scaffolding CLI.
