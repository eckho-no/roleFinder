# roleFinder — build plan v2.0

> **Supersedes:** `PLAN.md` (v1.0)
> **Date:** 2026-08-19
> **Repo:** https://github.com/eckho-no/roleFinder (public)
> **Execution model:** agentic — an agent works one GitHub issue at a time,
> one branch per issue, one PR per issue, CI green before merge.

---

## 0. What changed from v1.0, and why

v1.0 had good judgment and a thin schema. The scoping decisions were right; the
data model didn't survive contact with the tracker it's meant to replace. v2.0
keeps every v1.0 decision that held up and fixes eleven concrete defects:

| # | Defect in v1.0 | Fix in v2.0 |
|---|---|---|
| 1 | No deadline/expiry field, though §7 of the tracker is deadline management and two roles have already expired mid-deliberation | `listings.expires_at` + `deadline_source`; "closing soon" rail is the top element of the dashboard |
| 2 | `status` enum inconsistent (`pending_review` used but not defined) and conflated lifecycle with triage; no state for the ~40 "logged, not scored" entries | Split into `status` (lifecycle) and `triage` (workflow); both TEXT with app-level unions, since D1 has no enums |
| 3 | Drift detection needed a time series; schema only had `first_seen_at`/`last_seen_at` | `sightings` table — one row per listing per run per query |
| 4 | The 12-query set was JSON inside `runs` | `queries` promoted to a first-class table, joined via `sightings.query_id` |
| 5 | Fixed six score columns contradicted the coach's flagship "add a contract-vs-permanent axis" proposal | `scores.axes` as JSON keyed to axis ids defined in `profile_config`; `scores.profile_config_id` FK for reproducibility |
| 6 | Deploy was step 10 — the riskiest integration validated last | Deploy spine is Phase 1; every phase after it ships to `workers.dev` |
| 7 | Cron currency sweep would exceed Worker CPU/subrequest limits | Cron produces to a Cloudflare Queue; a consumer processes bounded batches |
| 8 | `agent_runs` had no cost, latency or error columns; no spend cap | Full observability columns + a daily budget guard that hard-fails the dispatcher |
| 9 | Auth under-specified: no rate limit, no constant-time compare, no cookie expiry, middleware-only gating | All four addressed; `requireSession()` in every handler as defence in depth |
| 10 | Vectorize and D1 can't share a transaction; embeddings would silently drift | `embedding_status`/`embedded_at` on `listings` + a reconcile pass |
| 11 | Outcome calibration would report noise at n≈10 | Hard n-gate; nothing rendered below n=20, and n is always shown |

Plus one promotion: the score-comparison sanity check in v1.0's Verification
section becomes **a real eval harness with its own phase and a CI gate** — see
§5, Phase 6. It is the highest-leverage item in this plan.

### Decisions confirmed with the user (2026-08-19)

- **Repo is public, seed data is synthetic.** Real tracker data never enters
  git. See §3.
- **The markdown loop keeps running in parallel.** This build is on its own
  timeline; `job-search-tracker-v8_x.md` remains the system of record until the
  app reaches parity (Phase 11). No phase here is on the critical path for the
  end-of-August decision date.
- **GitHub Issues is the tracker** — milestones per phase, one issue per task,
  labels for type/area/priority.

---

## 1. Context (carried from v1.0, unchanged)

The job-search loop currently lives in two files: a hand-maintained versioned
markdown tracker and a static HTML dashboard rendered from it. Every run, an LLM
session re-reads the whole file, re-runs 12 saved queries plus a Gmail alert
sweep, re-scores new listings against a 6-axis rubric by hand, and writes a new
version. It works, but there's no querying, no history beyond prose diffs, no
way to act from a phone, and the agentic parts are redone from scratch each
session.

Goal: a small gated Next.js app on Cloudflare (Workers + D1) backed by a real
schema that captures everything currently expressed in prose, plus an agentic
pipeline that does the work the LLM session does by hand — and an eval harness
that proves it does it well.

---

## 2. Stack and locked decisions

- **Runtime:** Next.js (App Router) on Cloudflare Workers via
  `@opennextjs/cloudflare`. Verify current versions and breaking changes at the
  start of Phase 1 — this ecosystem moves fast.
- **Database:** D1 (SQLite) via **Drizzle ORM**. Drizzle over Prisma here: no
  query-engine binary, better Workers cold-start, and `drizzle-kit` generates
  plain SQL that `wrangler d1 migrations apply` consumes directly.
- **Vectors:** Cloudflare Vectorize. **Embeddings:** Workers AI
  (`@cf/baai/bge-base-en-v1.5`).
- **Generation:** Anthropic Messages API via direct `fetch` — not the Node SDK,
  to stay edge-safe under OpenNext.
- **Queues:** Cloudflare Queues for any sweep that touches more than ~10 rows.
- **Rate limiting / short-lived state:** Workers KV. Never module-scope
  in-memory state — isolates don't share memory.
- **Crypto:** Web Crypto (`crypto.subtle`) only. No `node:crypto`, no bcrypt.

### Ingestion scope — unchanged from v1.0, and still the right call

Indeed and LinkedIn have no public API and scraping them from a hosted Worker is
a ToS and anti-bot problem. v1 does **not** attempt automated fetch from those
sources.

- **Adzuna** and **Reed** have free, legitimate public search APIs and already
  appear in the Gmail sweep as sources. These get a real scheduled Cron Trigger.
- **Everything else stays paste-in.** You paste a JD, the extraction agent
  structures it. Automate the extraction, not the acquisition.
- Schema accommodates a future legitimate feed (e.g. an official Indeed
  Publisher feed) via `listings.source` + `source_ref` without rework.

---

## 3. Privacy architecture (public repo)

The tracker contains a salary floor, a home area, a not-commutable list, candid
company commentary, a personal gaps list and a career decision date. None of it
goes into a public repo.

**Three tiers of data:**

1. **Committed, synthetic.** `fixtures/seed.synthetic.json` — fabricated
   companies, roles, locations and scores with the same *shape* as the real
   board (same tier distribution, same salary-stated ratio, same duplicate and
   stale-listing patterns). This is what CI seeds, what the demo mode serves,
   and what a reader browsing the repo sees.
2. **Committed, anonymised.** `fixtures/evals/*.json` — real JD text with
   company names, URLs and any identifying detail replaced by stable
   pseudonyms, paired with the real human scores. Needed because the eval
   harness is worthless against synthetic JDs. Reviewed by hand before commit.
3. **Never committed.** `data/private/` (gitignored) holds the real markdown
   tracker, the real seed, and anything derived from them. The real board lives
   only in the deployed D1.

**This applies to prose too.** Documentation in this repo — including this plan
— refers to real listings by pattern ("one recruiter req surfacing three times
in a run") rather than by company name and score. A named employer paired with a
private score is board data regardless of which file it sits in. The v1.0 plan
is gitignored for this reason; §0 records everything that changed.

**Enforcement, not just intent:**

- `.gitignore` covers `data/private/`, `job-search-tracker-*.md`,
  `job-search-dashboard-*.html`, `.env*`, `seed.local.*`, `*.local.json`.
- A `check:privacy` script greps staged content for a deny-list of tokens
  (postcode prefix, salary figures, the not-commutable town names, real company
  names from the board) and fails the commit. Wired as a pre-commit hook **and**
  as a CI job, because hooks don't run in CI and CI doesn't run before push.
- Run the `secrets-guard` skill before the first push and before any change to
  `.gitignore`.
- `profile_config` in the deployed app holds the real rules; the committed seed
  holds plausible fake ones.

---

## 4. Data model (Drizzle, D1/SQLite)

D1 has no native enums. Every field below marked *(union)* is a TEXT column with
a TypeScript union type and a Drizzle/Zod validator at the boundary.

### `companies`
`id` · `name` · `slug` · `domain_flag` (bool) · `domain_note` (e.g. "automotive")
· `careers_url` · `notes` · `created_at` · `updated_at`

### `queries`
`id` · `text` · `source` *(union: indeed/adzuna/reed/gmail_alert/manual)* ·
`is_active` · `added_in_run_id` · `retired_in_run_id` · `notes` · `created_at`

Seeded with the 12 permanent queries. Makes "which queries have ever produced an
Act-tier find" answerable — 5 of 12 produced nothing in run 7, which is a real
coach action rather than a hunch.

### `listings`
`id` · `company_id` · `title` · `url` · `link_type` *(union: stable/short_lived/
third_party)* · `source` *(union)* · `source_ref` (native id at the source) ·
`location` · `remote_type` *(union: remote/hybrid/onsite/unknown)* ·
`salary_min` · `salary_max` · `salary_currency` · `salary_period` *(union)* ·
`salary_stated` (bool) · `posted_date` · **`expires_at`** ·
**`deadline_source`** *(union: stated/inferred/none)* ·
`status` *(union: **live/closed/expired/unknown**)* ·
`triage` *(union: **pending_review/scored/logged_only/rejected/merged**)* ·
`status_confirmed_at` · `first_seen_at` · `last_seen_at` · `sighting_count` ·
`outcome` *(union: none/applied/responded/interviewed/offered/rejected/ghosted)*
· `outcome_at` · `raw_text` · `embedding_status` *(union: pending/ok/failed)* ·
`embedded_at` · `created_at` · `updated_at`

Splitting `status` from `triage` is the key fix. "Closed" and "we never scored
it" are orthogonal, and the tracker's single largest category — roughly 25
companies surfaced but never scorable, because the JD was never reachable — is
`status: unknown, triage: logged_only`. v1.0 had nowhere to put them.

### `sightings`
`id` · `listing_id` · `run_id` · `query_id` (nullable) · `source` · `seen_at` ·
`raw_snippet`

One row every time a listing surfaces. This is what makes the stale-listing rule
mechanical: a listing with `status: closed` and sightings continuing twelve days
past `status_confirmed_at` auto-flags, instead of a human noticing run after
run. It also gives the duplicate agent evidence — one recruiter req surfacing
three times in a single run across queries 3, 9 and 10 is a row pattern the
schema can see, not a judgement call a human has to remember to make.

### `profile_config`
`id` · `version` · `is_current` · `titles` (JSON) · `location_rules` (JSON:
commutable list, not-commutable list, radius, London rule) · `salary_floor` ·
`salary_hard_floor` · `positioning` (JSON) · `axes` (JSON) · `tier_thresholds`
(JSON) · `created_at` · `created_by` · `note`

`axes` is an ordered array of `{ id, label, description, max, weight }`. The
rubric is data, not columns — which is what lets the coach propose a new axis
without a migration. Rows are immutable; editing writes a new version and flips
`is_current`.

### `scores`
`id` · `listing_id` · **`profile_config_id`** (FK) · `axes` (JSON:
`{ axis_id: value }`) · `total` · `tier` *(union: act/consider/skip)* ·
`scored_by` *(union: manual/agent)* · `rationale` · `confidence` ·
`agent_run_id` · `superseded_by` · `created_at`

`total` and `tier` stay real columns so the dashboard can filter and sort
without unpacking JSON. Scores are append-only; a re-score supersedes rather
than overwrites, so the history the markdown expresses in prose ("rescored
25→24 after a closer read") becomes queryable.

### `notes`
`id` · `listing_id` (nullable) · `company_id` (nullable) · `type` *(union:
currency_check/duplicate_flag/judgment_call/application_log/process_note/
deadline/contact)* · `body` · `created_by` *(union: manual/agent)* ·
`agent_run_id` · `created_at`

`judgment_call` notes are what the coach agent chases — the tracker has a live
example that has gone unanswered for two runs.

### `runs`
`id` · `run_number` · `label` · `kind` *(union: full/sweep/manual/cron)* ·
`started_at` · `completed_at` · `summary` · `source` · `stats` (JSON)

Replaces the §9 revision-history table with real rows.

### `agent_runs`
`id` · `run_id` (nullable FK) · `listing_id` (nullable) · `agent_name` ·
`agent_version` · `prompt_version` · `parent_agent_run_id` (nullable — builds
the call tree) · `model` · `input` (JSON) · `output` (JSON) · `input_tokens` ·
`output_tokens` · `cost_estimate_usd` · `latency_ms` · `status` *(union:
ok/error/timeout/budget_denied)* · `error` · `created_at`

The observability columns are what turn the trace panel from a list of calls
into something worth showing someone. `prompt_version` is what makes replay
possible (Phase 9).

### `duplicates`
`id` · `listing_id` · `duplicate_of_listing_id` · `method` *(union:
fuzzy/vector/manual)* · `similarity` · `status` *(union: suspected/confirmed/
dismissed)* · `agent_run_id` · `created_at`

### `reflections`
`id` · `question` · `context` (JSON — which listings/patterns triggered it) ·
`status` *(union: open/answered/skipped)* · `answer` · `proposed_config_diff`
(JSON) · **`sample_size`** · `created_at` · `answered_at` · `agent_run_id`

`sample_size` exists so the UI can refuse to render a statistical claim below
n=20 rather than confidently correlating three data points.

### Vectorize index
One vector per listing (title + JD + latest rationale), re-embedded on update.
Reconciled against `listings.embedding_status` on a schedule — Vectorize and D1
have no shared transaction, so drift is a matter of when, not if.

---

## 5. Build phases

Each phase is a GitHub **milestone**. Each task is an **issue** with acceptance
criteria. Phases are ordered by dependency and by risk — the riskiest
integration (OpenNext on Workers) is validated in Phase 1, not Phase 10.

### M0 — Foundations
Repo, privacy guardrails, issue tracker, agent operating rules.
- `git init`, `.gitignore`, LICENSE, README with architecture sketch
- `check:privacy` deny-list script + pre-commit hook + CI job
- `secrets-guard` pass before first push
- Labels, milestones, all issues created
- `AGENTS.md` — conventions the building agent must follow (§6)
- `docs/adr/` with ADR-001 (stack), ADR-002 (ingestion scope), ADR-003 (privacy)

### M1 — Deploy spine *(risk-first)*
A hello-world that proves the whole delivery path before any feature exists.
- Web-search current `@opennextjs/cloudflare` / `wrangler` versions first
- Next.js scaffold, OpenNext adapter, `wrangler.jsonc` with `nodejs_compat`
- Bindings created and bound: D1, Vectorize, Workers AI, KV, Queue
- Deploy to `workers.dev`; one page renders; one D1 round-trip succeeds
- GitHub Actions: PR runs typecheck + lint + test + build; `main` deploys
- `wrangler rollback` tested deliberately, once, before it's needed

**Exit:** a URL exists, CI is green, and rollback works.

### M2 — Data model and seed
- Full Drizzle schema (§4) in **one** migration, including `agent_runs`,
  `reflections`, `duplicates`, `sightings`, `outcome` — nothing deferred
- `fixtures/seed.synthetic.json` + seed script
- One-off local converter: real markdown → `data/private/seed.local.json`
  (gitignored). Run once with an LLM, commit nothing, keep the output private
- Seed both local and remote D1; verify row counts and FK integrity

**Exit:** synthetic board queryable locally and on `workers.dev`.

### M3 — Auth, hardened
- `POST /api/auth/login`: constant-time compare against `AUTH_PASSWORD` secret
- HMAC-signed cookie via Web Crypto, **with expiry inside the signed payload**,
  `HttpOnly` + `Secure` + `SameSite=Lax` + `Path=/`
- KV-backed rate limit on the login route (and/or a Cloudflare WAF rate rule) —
  a single password on a public Worker is brute-forceable without one
- `middleware.ts` gate **and** a `requireSession()` call in every route handler.
  Middleware alone is one matcher typo away from an open API
- **Demo mode:** `DEMO_PASSWORD` issues a read-only session over the synthetic
  board. Without it the portfolio piece is invisible to its audience

**Exit:** fresh browser can't reach anything; demo password reaches a read-only
synthetic board; login is rate-limited.

### M4 — Read-only app
No AI yet. Get the "real database" win working end to end.
- `/` dashboard: **deadline rail first** (roles expiring within 14 days, sorted
  ascending), then tier counts and deltas, then filters by
  tier/status/triage/source. Reuse the existing dashboard's colour tokens
  (`--ink`, `--paper`, `--act`, `--consider`, `--skip`, `--stale`) for continuity
- `/listings/[id]`: fields, score breakdown, rationale, notes timeline,
  sighting history, outcome setter
- `/companies/[id]`, `/runs`, `/settings` (edit `profile_config` → new version)
- Mobile layout is a first-class requirement, not a stretch — acting on a
  listing from a phone is one of the stated goals

**Exit:** deployed, gated, and genuinely more useful than the HTML dashboard.

### M5 — Agent core
- `invokeAgent(name, input, { parentAgentRunId, runId })` dispatcher: one place
  that calls Claude, logs to `agent_runs`, enforces **max hop count** and a
  **daily USD budget** (sum today's `cost_estimate_usd`; exceed it and the
  dispatcher returns `budget_denied` rather than calling out)
- Per-agent model config — cheap/fast for extraction and duplicate matching,
  stronger for scoring and coaching
- **Extraction agent** (`POST /api/listings/extract`): raw JD → structured JSON
  via tool-use. Returns an editable draft; nothing auto-saves
- **Scoring agent** (`POST /api/listings/:id/score`): reads axes from current
  `profile_config`, returns per-axis values, total, tier, rationale, confidence
- `/listings/new` wired to both

**Exit:** paste a JD, get a scored draft, confirm, and it's in the board.

### M6 — Eval harness *(the highest-leverage phase)*
- `fixtures/evals/` — ~25 anonymised real JDs with their human scores
- Runner reports **per-axis MAE**, **tier-agreement rate**, and a **tier
  confusion matrix**; writes a JSON snapshot per run
- CI gate: tier agreement must not regress against the committed baseline
- `/evals` page rendering the latest snapshot and the trend

Two reasons this earns its own phase. Without it, "the coach improves the
rubric" is unfalsifiable — you cannot distinguish an improvement from a
regression. And §4 of the tracker lists *"formal eval harness (in progress)"* as
a known gap being closed before interviews. Building it here closes the CV gap
and produces the artifact in one move.

**Exit:** `npm run eval` prints a scorecard; CI fails on regression.

### M7 — Retrieval
- Workers AI embeddings on write; `embedding_status` tracked
- **Reconcile job**: find `embedding_status != 'ok'` and retry. Non-negotiable —
  Vectorize and D1 cannot commit together
- `POST /api/chat` + `/chat`: retrieve from Vectorize, answer via Claude with
  citations linking back to listing pages. **Streamed.**
- "Similar roles" panel on listing detail
- **Positioning-fit score**: embed the shuttl.ing positioning statement once,
  cosine it against every JD, surface as a cross-check on the stack axis — never
  as a replacement for it

### M8 — Ingestion and currency
- Adzuna + Reed API clients → `pending_review` rows + `sightings` rows
- Cron Trigger **produces to a Queue**; a consumer processes bounded batches.
  A single cron doing fetch-plus-Claude across 40+ listings will exceed Worker
  CPU and subrequest limits
- **Currency agent**: fetch listing URL, judge live vs. pulled, write a
  `currency_check` note and update `status_confirmed_at`
- **Duplicate agent**: fuzzy company+title+location plus vector similarity →
  `duplicates` rows; merge UI on listing detail
- **Drift rule**: sightings continuing N days after `status_confirmed_at` on a
  closed listing auto-raises a flag
- Manual trigger first, cron second — always

### M9 — Orchestration and trace
- `POST /api/listings/intake`: an orchestrator agent with `invoke_extraction`,
  `invoke_scoring`, `invoke_duplicate_check` and `invoke_web_research` as tools.
  Extraction → duplicate check (short-circuit to merge on a strong match) →
  scoring; and if `salary_stated` is false, it can call web research and
  re-score. Genuine agent-calls-agent, not a hard-coded frontend sequence
- **Agent trace panel** on listing detail: the call tree with model, tokens,
  cost and latency per hop, **streamed over SSE** as it happens
- **Replay**: re-run a logged `agent_run` against current prompts and diff the
  output. Cheap once `prompt_version` is on the table; unusually strong signal

### M10 — Coach and calibration
- Weekly cron reflection agent: unanswered judgment calls, ambiguous rationales,
  stale `pending_review` rows, drift between `profile_config` and actual scoring
  behaviour. Writes 1–3 targeted questions to `reflections`
- Dashboard reflection queue. Answers may carry a `proposed_config_diff` you
  approve or reject explicitly — **nothing auto-applies**
- **Outcome calibration, n-gated**: per-axis score vs. outcome stats, rendered
  only at n≥20, always displaying n. Knowing when not to trust the numbers is a
  better signal than the numbers
- Clustering pass over the Vectorize index to surface archetypes

### M11 — Cutover
- `GET /api/export/markdown` regenerates a tracker-format document. Zero-risk
  cutover, and it preserves the upload-and-run-the-loop workflow as a fallback
- Parity check against the current v8.x tracker
- README with architecture diagram, demo credentials, eval scorecard
- Retire the two source files (or keep them as the seed/export format)

### Deferred to v2
**Salary inference.** An agent with web search plus the growing internal dataset
proposes an estimated range with explicit confidence. Useful — half the current
Act tier has unstated salary — but it depends on having enough `salary_stated`
history to be more than a guess.

---

## 6. Agent operating rules

These live in `AGENTS.md` at the repo root and bind the building agent.

1. **One issue → one branch → one PR.** Branch name `<type>/<issue#>-<slug>`,
   e.g. `feat/23-deadline-rail`. PR body includes `Closes #23`.
2. **Never commit real job-search data.** `check:privacy` must pass. If it
   fails, fix the data, don't weaken the deny-list.
3. **Never commit secrets.** All secrets via `wrangler secret put`; plain config
   in `wrangler.jsonc` `vars`. Run `secrets-guard` before any push that touches
   `.gitignore`, `.env*` or config.
4. **Migrations are append-only** after M2 ships. No editing an applied
   migration.
5. **Edge-safety sweep before each PR:** no module-scope mutable state, no
   `node:crypto`, no self-referencing `fetch` to own `/api/*`, no unbounded loops
   in a cron handler.
6. **Every agent call goes through `invokeAgent`.** No direct Anthropic fetch in
   a route handler — otherwise the trace, the budget cap and the hop limit all
   have holes.
7. **CI must be green before merge:** typecheck, lint, test, `check:privacy`,
   and from M6 onward the eval gate.
8. **Update the issue before closing it** with what actually shipped, including
   anything descoped. A closed issue that quietly dropped half its acceptance
   criteria is worse than an open one.
9. **Deploy after every milestone**, not at the end.
10. **When a phase's assumption turns out wrong, write an ADR** rather than
    silently deviating.

---

## 7. GitHub workflow

- **Repo:** `eckho-no/roleFinder`, public, `main` as default branch.
- **Branch protection on `main`:** require PR, require CI green, no direct
  pushes. (Set once M1's CI exists.)
- **Milestones:** M0–M11 as above.
- **Labels:**
  - `type:` feat, fix, chore, infra, schema, agent, docs, test
  - `area:` db, auth, ui, ai, retrieval, ingestion, ops, evals
  - `priority:` p0 (blocks the phase), p1 (in-phase), p2 (nice-to-have)
- **Issue template:** context → acceptance criteria (checkboxes) → out of scope.
- **Commits:** conventional commits, `type(scope): subject`, imperative.
- **CI (`.github/workflows/ci.yml`):** on PR — install, typecheck, lint, unit
  tests, `check:privacy`, build, eval gate (from M6).
- **CD (`.github/workflows/deploy.yml`):** on push to `main` — same checks, then
  `wrangler deploy`. Auth via a least-privilege `CLOUDFLARE_API_TOKEN` repo
  secret. Deployment environment `production` with the URL recorded.

---

## 8. Verification gates

Per-phase exit criteria are in §5. Global gates:

- **Local:** `npm run dev` against local D1 (`wrangler d1 ... --local`) —
  auth gate, CRUD and agent calls work before anything deploys.
- **Seed round-trip:** after seeding the private board, the four current
  Act-tier entries and their per-axis scores round-trip exactly, totals
  included. (Checked against the private seed locally; the committed fixture is
  synthetic — see §3.)
- **Agent quality:** the eval harness, not a spot-check. Baseline committed at
  M6; CI fails on tier-agreement regression.
- **Deploy:** login gate holds from a fresh browser session; demo password
  reaches only the synthetic board; cron fires and is visible in Cloudflare
  logs; `wrangler secret list` matches the app's env contract; rollback tested.
- **Privacy:** `check:privacy` green, and a manual read of the public repo's
  file list before it goes public.

---

## 9. Known risks

| Risk | Mitigation |
|---|---|
| OpenNext/Workers version churn breaks the build | Version-check at Phase 1 start; lockfile committed; CI builds every PR |
| Anthropic spend runs away via orchestrator + cron | Daily budget cap in the dispatcher; hop limit; cheap models for cheap agents; cost visible in the trace panel |
| Vectorize drifts from D1 | `embedding_status` + scheduled reconcile |
| Cron sweep exceeds Worker limits | Queue-based batching from the start |
| Adzuna/Reed rate limits or T&C change | Both are manual-trigger before cron; ingestion is additive — the paste-in path always works |
| Real data leaks into the public repo | Three-tier data model, deny-list script in hook *and* CI, `secrets-guard` |
| Scope is large for a portfolio project | Phases are independently shippable and deployed; M0–M6 alone is a complete, defensible project |
