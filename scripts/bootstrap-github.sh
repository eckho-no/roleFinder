#!/usr/bin/env bash
# Bootstrap the roleFinder issue tracker: labels, milestones M0-M11, and the
# full issue set from PLAN_2.0.md §5.
#
# Idempotent — safe to re-run. Existing labels/milestones are updated, and
# issues are skipped if an open issue with the same title already exists.
#
# Requires: gh CLI, authenticated against an account with write access to REPO.
#   gh auth status || gh auth login
#
# Usage: scripts/bootstrap-github.sh [--dry-run]

set -euo pipefail

REPO="${REPO:-eckho-no/roleFinder}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

command -v gh >/dev/null || { echo "error: gh CLI not found" >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "error: gh not authenticated — run 'gh auth login'" >&2; exit 1; }

say() { printf '\033[0;36m%s\033[0m\n' "$*"; }
run() { if (( DRY_RUN )); then echo "  [dry-run] $*"; else "$@" >/dev/null 2>&1 || true; fi; }

# ---------------------------------------------------------------------------
# Labels
# ---------------------------------------------------------------------------
say "==> labels"
mklabel() {
  if (( DRY_RUN )); then echo "  [dry-run] label $1"; return; fi
  gh label create "$1" --repo "$REPO" --color "$2" --description "$3" --force >/dev/null 2>&1 \
    && echo "  $1" || echo "  $1 (skipped)"
}

mklabel "type:feat"      "0E8A16" "New user-facing capability"
mklabel "type:fix"       "D73A4A" "Bug fix"
mklabel "type:chore"     "FEF2C0" "Maintenance, deps, tidying"
mklabel "type:infra"     "1D76DB" "Build, deploy, CI/CD, bindings"
mklabel "type:schema"    "5319E7" "Database schema or migration"
mklabel "type:agent"     "B60205" "Agent, prompt, or orchestration work"
mklabel "type:docs"      "0075CA" "Documentation and ADRs"
mklabel "type:test"      "BFD4F2" "Tests and eval harness"

mklabel "area:db"        "C2E0C6" "D1, Drizzle, migrations"
mklabel "area:auth"      "F9D0C4" "Login, sessions, gating"
mklabel "area:ui"        "FBCA04" "Pages, components, layout"
mklabel "area:ai"        "E99695" "Claude calls, prompts, dispatcher"
mklabel "area:retrieval" "D4C5F9" "Vectorize, embeddings, RAG"
mklabel "area:ingestion" "C5DEF5" "Adzuna, Reed, cron, queues"
mklabel "area:ops"       "BFDADC" "Secrets, budgets, observability"
mklabel "area:evals"     "006B75" "Eval harness and scorecards"
mklabel "area:privacy"   "B60205" "Data protection and leak prevention"

mklabel "priority:p0"    "B60205" "Blocks the milestone"
mklabel "priority:p1"    "D93F0B" "Core to the milestone"
mklabel "priority:p2"    "FEF2C0" "Nice to have"

# ---------------------------------------------------------------------------
# Milestones
# ---------------------------------------------------------------------------
say "==> milestones"
mkmilestone() {
  if (( DRY_RUN )); then echo "  [dry-run] milestone $1"; return; fi
  gh api "repos/$REPO/milestones" -f title="$1" -f description="$2" >/dev/null 2>&1 \
    && echo "  $1" || echo "  $1 (exists)"
}

mkmilestone "M0 — Foundations"        "Repo, privacy guardrails, tracker, agent operating rules."
mkmilestone "M1 — Deploy spine"       "Risk-first: prove the whole delivery path before any feature exists."
mkmilestone "M2 — Data model"         "Full Drizzle schema in one migration, plus synthetic seed."
mkmilestone "M3 — Auth"               "Hardened password gate, signed cookie, rate limit, demo mode."
mkmilestone "M4 — Read-only app"      "Dashboard, detail, company, runs, settings. No AI yet."
mkmilestone "M5 — Agent core"         "Dispatcher with budget and hop caps; extraction and scoring agents."
mkmilestone "M6 — Eval harness"       "Measure the scoring agent against human scores. CI gate."
mkmilestone "M7 — Retrieval"          "Embeddings, reconcile, RAG chat, similarity, positioning fit."
mkmilestone "M8 — Ingestion"          "Adzuna/Reed via queue-backed cron; currency and duplicate agents."
mkmilestone "M9 — Orchestration"      "Intake orchestrator, streamed agent trace, replay."
mkmilestone "M10 — Coach"             "Reflection agent, approval queue, n-gated calibration, clustering."
mkmilestone "M11 — Cutover"           "Markdown export, parity check, retire the source files."

# ---------------------------------------------------------------------------
# Issues
# ---------------------------------------------------------------------------
say "==> issues"
mkissue() {
  local title="$1" milestone="$2" labels="$3" body="$4"
  if (( DRY_RUN )); then echo "  [dry-run] $title"; return; fi
  if gh issue list --repo "$REPO" --state all --search "\"$title\" in:title" --json title \
     | grep -qF "$title"; then
    echo "  $title (exists)"; return
  fi
  gh issue create --repo "$REPO" --title "$title" --milestone "$milestone" \
    --label "$labels" --body "$body" >/dev/null && echo "  $title"
}

# ---- M0 -------------------------------------------------------------------
M=$'M0 — Foundations'
mkissue "Add LICENSE and repo metadata" "$M" "type:chore,priority:p1" \
'Choose and add a LICENSE, set repo description and topics.

### Acceptance criteria
- [ ] LICENSE file present (MIT unless decided otherwise)
- [ ] Repo description and topics set
- [ ] Default branch is `main`'

mkissue "Write check:privacy deny-list script" "$M" "type:infra,area:privacy,priority:p0" \
'The repo is public and the job-search data is not. See PLAN_2.0.md §3.

### Acceptance criteria
- [ ] `scripts/check-privacy.sh` greps staged content for a deny-list: postcode prefix, salary figures, not-commutable town names, real company names
- [ ] Deny-list itself lives in a gitignored file so it does not leak what it protects
- [ ] Exits non-zero with the offending file:line on a hit
- [ ] `npm run check:privacy` wired

### Out of scope
CI wiring — separate issue.'

mkissue "Wire check:privacy as pre-commit hook and CI job" "$M" "type:infra,area:privacy,priority:p0" \
'Hooks do not run in CI and CI does not run before push. Both are needed.

### Acceptance criteria
- [ ] Pre-commit hook installed via a committed setup script
- [ ] CI job runs the same script on every PR
- [ ] Deliberate test: a commit containing a deny-list token is blocked locally and in CI'

mkissue "Write AGENTS.md operating rules" "$M" "type:docs,priority:p0" \
'Codify PLAN_2.0.md §6 as the contract the building agent follows.

### Acceptance criteria
- [ ] Branch/PR/commit conventions
- [ ] Never-commit rules for real data and secrets
- [ ] Edge-safety sweep checklist
- [ ] Rule that every Claude call goes through `invokeAgent`
- [ ] Rule that issues are updated with what actually shipped before closing'

mkissue "Add ADR-001 stack, ADR-002 ingestion scope, ADR-003 privacy" "$M" "type:docs,priority:p1" \
'### Acceptance criteria
- [ ] `docs/adr/` created with a template
- [ ] ADR-001: Next.js + OpenNext + D1 + Drizzle, with the Drizzle-over-Prisma rationale
- [ ] ADR-002: why Indeed/LinkedIn are paste-in and Adzuna/Reed are automated
- [ ] ADR-003: three-tier data model for a public repo'

mkissue "Add issue and PR templates" "$M" "type:chore,priority:p2" \
'### Acceptance criteria
- [ ] Issue template: context → acceptance criteria checkboxes → out of scope
- [ ] PR template with a `Closes #` line and an edge-safety checklist'

# ---- M1 -------------------------------------------------------------------
M=$'M1 — Deploy spine'
mkissue "Verify current OpenNext and wrangler versions" "$M" "type:infra,priority:p0" \
'The Cloudflare/OpenNext ecosystem moves fast; do this before scaffolding.

### Acceptance criteria
- [ ] Current `@opennextjs/cloudflare`, `wrangler`, `drizzle-orm` versions checked against their docs/changelogs
- [ ] Breaking changes affecting this plan noted in ADR-001
- [ ] Versions pinned in package.json, lockfile committed'

mkissue "Scaffold Next.js with OpenNext Cloudflare adapter" "$M" "type:infra,priority:p0" \
'### Acceptance criteria
- [ ] Next.js App Router scaffold
- [ ] `@opennextjs/cloudflare` installed and configured
- [ ] No `output: standalone` in next.config
- [ ] `wrangler.jsonc` with name, compatibility_date, nodejs_compat, assets binding
- [ ] `opennextjs-cloudflare build` then `preview` succeeds locally'

mkissue "Create and bind D1, Vectorize, Workers AI, KV and Queue" "$M" "type:infra,area:ops,priority:p0" \
'### Acceptance criteria
- [ ] All five resources created via wrangler
- [ ] Bindings present in `wrangler.jsonc` and typed in the app
- [ ] `.env.example` documents the env contract
- [ ] Secrets set via `wrangler secret put`, never committed'

mkissue "First deploy to workers.dev with a D1 round-trip" "$M" "type:infra,priority:p0" \
'Prove the delivery path before building on it.

### Acceptance criteria
- [ ] Deployed to a workers.dev URL
- [ ] One page renders server-side
- [ ] One D1 read and one D1 write succeed in production
- [ ] URL recorded in the README'

mkissue "CI workflow: typecheck, lint, test, privacy, build" "$M" "type:infra,priority:p0" \
'### Acceptance criteria
- [ ] `.github/workflows/ci.yml` runs on PR
- [ ] Steps: install, typecheck, lint, unit tests, check:privacy, build
- [ ] Green on a trivial PR
- [ ] Branch protection on `main` requires it'

mkissue "CD workflow and a deliberate rollback test" "$M" "type:infra,area:ops,priority:p1" \
'### Acceptance criteria
- [ ] `.github/workflows/deploy.yml` deploys on push to `main`
- [ ] Auth via least-privilege `CLOUDFLARE_API_TOKEN` repo secret
- [ ] `wrangler rollback` executed once on purpose and documented
- [ ] Deployment environment `production` records the URL'

# ---- M2 -------------------------------------------------------------------
M=$'M2 — Data model'
mkissue "Drizzle schema: companies, queries, listings, sightings" "$M" "type:schema,area:db,priority:p0" \
'See PLAN_2.0.md §4. D1 has no enums — TEXT columns with TypeScript unions.

### Acceptance criteria
- [ ] `listings` includes `expires_at` and `deadline_source`
- [ ] `status` (live/closed/expired/unknown) separate from `triage` (pending_review/scored/logged_only/rejected/merged)
- [ ] `sightings` table with listing_id, run_id, query_id, source, seen_at
- [ ] `queries` first-class with is_active and added/retired run refs
- [ ] Zod validators at every boundary for the union columns'

mkissue "Drizzle schema: profile_config, scores, notes, runs" "$M" "type:schema,area:db,priority:p0" \
'### Acceptance criteria
- [ ] `profile_config.axes` is JSON — the rubric is data, not columns
- [ ] `profile_config` rows immutable; editing writes a new version and flips is_current
- [ ] `scores.axes` JSON keyed by axis id, with `total`/`tier` as real columns
- [ ] `scores.profile_config_id` FK so a score is reproducible
- [ ] Scores append-only; re-score sets `superseded_by`'

mkissue "Drizzle schema: agent_runs, duplicates, reflections" "$M" "type:schema,area:db,priority:p0" \
'### Acceptance criteria
- [ ] `agent_runs` has model, prompt_version, input/output_tokens, cost_estimate_usd, latency_ms, status, error
- [ ] `agent_runs.parent_agent_run_id` self-FK for the call tree
- [ ] `reflections.sample_size` present for the n-gate
- [ ] `duplicates` with method, similarity, status'

mkissue "Generate and apply the single initial migration" "$M" "type:schema,area:db,priority:p0" \
'One migration containing everything, including tables not used until M9/M10 — avoids a backfill later.

### Acceptance criteria
- [ ] Migration generated via drizzle-kit
- [ ] Applied to local D1 and to remote
- [ ] FK integrity and indexes verified
- [ ] Migrations are append-only from here'

mkissue "Synthetic seed fixture and seed script" "$M" "type:test,area:privacy,priority:p0" \
'Committed fixture must be fabricated but shape-accurate. See PLAN_2.0.md §3.

### Acceptance criteria
- [ ] `fixtures/seed.synthetic.json` with fabricated companies, roles, locations, scores
- [ ] Mirrors the real board shape: tier distribution, salary-stated ratio, one stale listing, one duplicated req
- [ ] `npm run seed` loads it into local or remote D1
- [ ] check:privacy passes on the fixture'

mkissue "Private markdown-to-seed converter" "$M" "type:chore,area:privacy,priority:p1" \
'### Acceptance criteria
- [ ] Script converts the real tracker markdown to `data/private/seed.local.json`
- [ ] Output path is gitignored; script asserts this before writing
- [ ] Seeds the real board into the deployed D1 only'

# ---- M3 -------------------------------------------------------------------
M=$'M3 — Auth'
mkissue "Login route with constant-time password compare" "$M" "type:feat,area:auth,priority:p0" \
'### Acceptance criteria
- [ ] `POST /api/auth/login` compares against the `AUTH_PASSWORD` secret
- [ ] Comparison is constant-time (HMAC both sides and compare digests)
- [ ] No timing or error-message difference between wrong password and missing password'

mkissue "HMAC session cookie with embedded expiry" "$M" "type:feat,area:auth,priority:p0" \
'### Acceptance criteria
- [ ] Cookie signed with Web Crypto HMAC — no node:crypto, no bcrypt
- [ ] Expiry inside the signed payload, not only in cookie attributes
- [ ] HttpOnly, Secure, SameSite=Lax, Path=/
- [ ] Tampered and expired cookies both rejected (tested)'

mkissue "Middleware gate plus requireSession in every handler" "$M" "type:feat,area:auth,priority:p0" \
'Middleware alone is one matcher typo away from an open API.

### Acceptance criteria
- [ ] `middleware.ts` gates all non-public routes
- [ ] `requireSession()` called in every API route handler
- [ ] Test proves an API route rejects unauthenticated requests even with middleware bypassed'

mkissue "KV-backed rate limit on the login route" "$M" "type:feat,area:auth,area:ops,priority:p0" \
'A single password on a public Worker is brute-forceable without one. In-memory limiters do not work on Workers.

### Acceptance criteria
- [ ] Per-IP attempt counter in KV with a backoff window
- [ ] Lockout response does not leak whether the password was close
- [ ] Optionally also a Cloudflare WAF rate rule, documented'

mkissue "Demo mode: read-only session over synthetic data" "$M" "type:feat,area:auth,priority:p1" \
'Without this the portfolio piece is invisible to the audience it is for.

### Acceptance criteria
- [ ] `DEMO_PASSWORD` issues a session with role `demo`
- [ ] Demo sessions are read-only — all writes and all agent invocations rejected
- [ ] Demo sessions see only the synthetic board, never real rows
- [ ] Credentials documented in the README'

# ---- M4 -------------------------------------------------------------------
M=$'M4 — Read-only app'
mkissue "Deadline rail on the dashboard" "$M" "type:feat,area:ui,priority:p0" \
'The highest-value behaviour of the tracker it replaces. Two roles have already expired mid-deliberation.

### Acceptance criteria
- [ ] Top element of `/`, above tier counts
- [ ] Lists listings with `expires_at` within 14 days, ascending
- [ ] Visually distinguishes stated vs inferred deadlines
- [ ] Empty state when nothing is closing'

mkissue "Dashboard tier summary and deltas" "$M" "type:feat,area:ui,priority:p1" \
'### Acceptance criteria
- [ ] Act/Consider/Skip counts with change since the previous run
- [ ] Reuses the existing dashboard colour tokens (--ink, --paper, --act, --consider, --skip, --stale)'

mkissue "Dashboard filters by tier, status, triage and source" "$M" "type:feat,area:ui,priority:p1" \
'### Acceptance criteria
- [ ] Filters are URL state so views are shareable and bookmarkable
- [ ] `triage:logged_only` is reachable — it is the largest category'

mkissue "Listing detail page" "$M" "type:feat,area:ui,priority:p0" \
'### Acceptance criteria
- [ ] Fields, score breakdown per axis, rationale
- [ ] Notes timeline
- [ ] Sighting history
- [ ] Outcome setter (applied/responded/interviewed/offered/rejected/ghosted)

### Out of scope
Re-score and check-currency buttons — M5 and M8.'

mkissue "Company, runs and settings pages" "$M" "type:feat,area:ui,priority:p1" \
'### Acceptance criteria
- [ ] `/companies/[id]` lists all listings for a company
- [ ] `/runs` replaces the markdown revision-history table
- [ ] `/settings` edits profile_config and writes a new version rather than mutating
- [ ] Settings shows which version is current and when it changed'

mkissue "Mobile layout pass" "$M" "type:feat,area:ui,priority:p1" \
'Acting on a listing from a phone is a stated goal, not a stretch.

### Acceptance criteria
- [ ] Dashboard, deadline rail and listing detail usable at 375px
- [ ] Tap targets meet minimum size
- [ ] Verified on a real device or emulated viewport'

# ---- M5 -------------------------------------------------------------------
M=$'M5 — Agent core'
mkissue "invokeAgent dispatcher with agent_runs logging" "$M" "type:agent,area:ai,priority:p0" \
'One place that knows how to call Claude, log it, and enforce limits.

### Acceptance criteria
- [ ] `invokeAgent(name, input, { parentAgentRunId, runId })`
- [ ] Writes an `agent_runs` row with model, prompt_version, tokens, cost, latency, status
- [ ] Per-agent model config — cheap models for extraction and matching, stronger for scoring
- [ ] Direct Anthropic fetch outside the dispatcher fails lint'

mkissue "Hop limit and daily budget cap" "$M" "type:agent,area:ops,priority:p0" \
'Orchestrator plus web search plus cron is an unbounded-spend shape.

### Acceptance criteria
- [ ] Max hop count enforced across a call chain
- [ ] Daily USD cap: sum today cost_estimate_usd; over budget returns status `budget_denied` without calling out
- [ ] Cap configurable via env; current spend visible in the UI'

mkissue "Extraction agent" "$M" "type:agent,area:ai,priority:p0" \
'### Acceptance criteria
- [ ] `POST /api/listings/extract` takes raw JD text
- [ ] Claude tool-use returns structured JSON: company, title, location, remote_type, salary, expires_at, stack and flex signals, source guess
- [ ] Returns an editable draft — nothing auto-saves
- [ ] Malformed model output handled without a 500'

mkissue "Scoring agent" "$M" "type:agent,area:ai,priority:p0" \
'### Acceptance criteria
- [ ] `POST /api/listings/:id/score` reads axes from the current profile_config
- [ ] Returns per-axis values, total, tier, rationale and confidence
- [ ] Writes a new `scores` row referencing the profile_config version used
- [ ] Re-runnable; supersedes rather than overwrites
- [ ] Adding an axis in settings changes the output with no code change'

mkissue "Wire /listings/new to the draft flow" "$M" "type:feat,area:ui,priority:p1" \
'### Acceptance criteria
- [ ] Paste JD → extraction → editable draft → confirm → saved and scored
- [ ] Every field editable before save
- [ ] Errors surfaced without losing the pasted text'

# ---- M6 -------------------------------------------------------------------
M=$'M6 — Eval harness'
mkissue "Build and anonymise the eval fixture set" "$M" "type:test,area:evals,area:privacy,priority:p0" \
'Synthetic JDs are useless for evals; these must be real text, anonymised.

### Acceptance criteria
- [ ] ~25 real JDs in `fixtures/evals/`, spanning all three tiers
- [ ] Company names, URLs and identifying detail replaced with stable pseudonyms
- [ ] Each paired with its human per-axis scores
- [ ] Hand-reviewed before commit; check:privacy passes'

mkissue "Eval runner: MAE, tier agreement, confusion matrix" "$M" "type:test,area:evals,priority:p0" \
'### Acceptance criteria
- [ ] `npm run eval` scores every fixture through the real scoring agent
- [ ] Reports per-axis mean absolute error
- [ ] Reports tier-agreement rate and a 3x3 confusion matrix
- [ ] Writes a JSON snapshot per run
- [ ] Deterministic enough to compare across runs (temperature pinned)'

mkissue "CI eval gate against a committed baseline" "$M" "type:test,area:evals,priority:p0" \
'Without this, "the coach improves the rubric" is unfalsifiable.

### Acceptance criteria
- [ ] Baseline snapshot committed
- [ ] CI fails if tier agreement regresses beyond a tolerance
- [ ] Updating the baseline is an explicit, reviewable commit'

mkissue "/evals page showing the latest scorecard and trend" "$M" "type:feat,area:evals,area:ui,priority:p1" \
'### Acceptance criteria
- [ ] Renders the latest snapshot: per-axis MAE, agreement rate, confusion matrix
- [ ] Shows the trend across snapshots
- [ ] Visible in demo mode — it is the most persuasive page in the app'

# ---- M7 -------------------------------------------------------------------
M=$'M7 — Retrieval'
mkissue "Embedding write path with embedding_status tracking" "$M" "type:feat,area:retrieval,priority:p0" \
'### Acceptance criteria
- [ ] On listing create/update, embed title + JD + latest rationale via Workers AI
- [ ] Upsert to Vectorize; set embedding_status ok/failed and embedded_at
- [ ] A Vectorize failure never fails the D1 write'

mkissue "Vectorize reconcile job" "$M" "type:feat,area:retrieval,area:ops,priority:p0" \
'Vectorize and D1 cannot commit together, so drift is a matter of when.

### Acceptance criteria
- [ ] Scheduled pass finds embedding_status != ok and retries
- [ ] Detects orphaned vectors whose listing was deleted
- [ ] Reports counts to the runs table'

mkissue "RAG chat API with streamed, cited answers" "$M" "type:agent,area:retrieval,priority:p1" \
'### Acceptance criteria
- [ ] `POST /api/chat` embeds the query, retrieves nearest listings and notes
- [ ] Answers via Claude with citations linking to listing pages
- [ ] Response streamed to `/chat`
- [ ] Answers "what did I say about <company>?" and "find roles like <listing>"'

mkissue "Similar roles panel on listing detail" "$M" "type:feat,area:retrieval,priority:p2" \
'### Acceptance criteria
- [ ] Nearest neighbours by embedding, excluding the listing itself
- [ ] Confirmed duplicates visually distinguished from merely similar roles'

mkissue "Positioning-fit score" "$M" "type:feat,area:retrieval,priority:p2" \
'### Acceptance criteria
- [ ] Positioning statement embedded once and versioned
- [ ] Cosine similarity against every JD embedding
- [ ] Displayed as a cross-check on the stack axis, explicitly not a replacement for it'

# ---- M8 -------------------------------------------------------------------
M=$'M8 — Ingestion'
mkissue "Adzuna API client" "$M" "type:feat,area:ingestion,priority:p1" \
'### Acceptance criteria
- [ ] Authenticated search against the active query set
- [ ] Maps results to listings (triage: pending_review) and writes sightings rows
- [ ] Existing listings update last_seen_at and sighting_count rather than duplicating
- [ ] Rate limits and error responses handled'

mkissue "Reed API client" "$M" "type:feat,area:ingestion,priority:p1" \
'### Acceptance criteria
- [ ] Same contract as the Adzuna client behind a shared source interface
- [ ] Adding a third source requires no changes to the ingestion runner'

mkissue "Queue-backed cron ingestion and sweep" "$M" "type:infra,area:ingestion,priority:p0" \
'A single cron doing fetch-plus-Claude across 40+ listings will exceed Worker CPU and subrequest limits.

### Acceptance criteria
- [ ] Cron Trigger produces messages to a Cloudflare Queue
- [ ] Consumer processes bounded batches with retry and a dead-letter path
- [ ] Manual trigger endpoint exists and is used first; cron enabled only after it works
- [ ] Each sweep opens and closes a `runs` row'

mkissue "Currency-check agent" "$M" "type:agent,area:ingestion,priority:p1" \
'### Acceptance criteria
- [ ] Fetches the listing URL and asks Claude whether it still reads as live
- [ ] Writes a currency_check note and updates status and status_confirmed_at
- [ ] Runs on demand from listing detail and on the sweep for anything unconfirmed >7 days
- [ ] Unfetchable URLs resolve to `unknown`, never silently to `closed`'

mkissue "Duplicate agent and merge flow" "$M" "type:agent,area:ingestion,priority:p1" \
'### Acceptance criteria
- [ ] Fuzzy company+title+location match plus vector similarity
- [ ] Writes `duplicates` rows with method and similarity
- [ ] Merge UI on listing detail; merging preserves both sighting histories
- [ ] Catches the same req surfacing under several query keywords'

mkissue "Stale-listing drift rule" "$M" "type:feat,area:ingestion,priority:p1" \
'Currently caught only by a human noticing run after run.

### Acceptance criteria
- [ ] Listing with status closed and sightings continuing N days past status_confirmed_at auto-flags
- [ ] N configurable; default 3
- [ ] Flag surfaces on the dashboard and as a note'

# ---- M9 -------------------------------------------------------------------
M=$'M9 — Orchestration'
mkissue "Intake orchestrator with agents as tools" "$M" "type:agent,area:ai,priority:p0" \
'Genuine agent-calls-agent, not a hard-coded frontend sequence.

### Acceptance criteria
- [ ] `POST /api/listings/intake` exposes invoke_extraction, invoke_scoring, invoke_duplicate_check, invoke_web_research as tools
- [ ] Extraction → duplicate check → scoring, short-circuiting to merge on a strong match
- [ ] When salary_stated is false, may call web research and re-score
- [ ] Every hop logged with the correct parent_agent_run_id
- [ ] Hop limit and budget cap enforced
- [ ] `/listings/new` switched over from the hard-coded sequence'

mkissue "Streamed agent trace panel" "$M" "type:feat,area:ui,area:ai,priority:p1" \
'The best demo in the app — watch the chain land live.

### Acceptance criteria
- [ ] Call tree on listing detail from parent_agent_run_id
- [ ] Per hop: agent, model, tokens, cost, latency, status
- [ ] Streamed over SSE as the chain runs
- [ ] Failed and budget_denied hops clearly rendered'

mkissue "Replay an agent run against current prompts" "$M" "type:feat,area:ai,priority:p2" \
'### Acceptance criteria
- [ ] Re-runs a logged agent_run with its recorded input against current prompts
- [ ] Diffs old vs new output side by side
- [ ] Replay runs are marked so they do not pollute cost reporting'

# ---- M10 ------------------------------------------------------------------
M=$'M10 — Coach'
mkissue "Reflection agent on a weekly cron" "$M" "type:agent,area:ai,priority:p1" \
'### Acceptance criteria
- [ ] Reviews unanswered judgment_call notes, ambiguous rationales, stale pending_review rows, and drift between profile_config and actual scoring
- [ ] Writes 1-3 targeted questions to `reflections` with context JSON
- [ ] Does not re-ask a question already answered or skipped
- [ ] Runs through invokeAgent like everything else'

mkissue "Reflection queue with explicit approve or reject" "$M" "type:feat,area:ui,priority:p1" \
'### Acceptance criteria
- [ ] Banner or queue on the dashboard
- [ ] Answering may carry a proposed_config_diff, rendered as a readable diff
- [ ] Approving writes a new profile_config version; rejecting records why
- [ ] Nothing is ever auto-applied'

mkissue "Outcome calibration with a hard n-gate" "$M" "type:feat,area:evals,priority:p2" \
'At n around 10 this is noise. Knowing when not to trust the numbers is the better signal.

### Acceptance criteria
- [ ] Per-axis score vs outcome stats
- [ ] Nothing rendered below n=20; shows "not enough data (n=X)" instead
- [ ] n always displayed alongside any figure
- [ ] Feeds rubric suggestions into the reflection queue, never directly into config'

mkissue "Clustering pass over the vector index" "$M" "type:feat,area:retrieval,priority:p2" \
'### Acceptance criteria
- [ ] Periodic clustering of all listing embeddings
- [ ] Clusters labelled by an agent into readable archetypes
- [ ] Surfaced on the dashboard as a breakdown of where the board actually sits'

# ---- M11 ------------------------------------------------------------------
M=$'M11 — Cutover'
mkissue "Markdown export endpoint" "$M" "type:feat,priority:p1" \
'Zero-risk cutover, and it preserves the upload-and-run-the-loop workflow as a fallback.

### Acceptance criteria
- [ ] `GET /api/export/markdown` regenerates a tracker-format document from the DB
- [ ] Output includes all sections the current tracker carries
- [ ] Round-trips through the seed importer without loss'

mkissue "Parity check against the current markdown tracker" "$M" "type:test,priority:p0" \
'### Acceptance criteria
- [ ] Every scored listing in the current tracker present with matching per-axis scores and totals
- [ ] Every closed/pending entry has the right status
- [ ] Every logged-not-scored company present as triage:logged_only
- [ ] Discrepancies resolved or explicitly documented'

mkissue "README, architecture diagram and demo credentials" "$M" "type:docs,priority:p1" \
'### Acceptance criteria
- [ ] Architecture diagram of the request path and the agent call graph
- [ ] Demo URL and demo password in the README
- [ ] Latest eval scorecard embedded
- [ ] Source markdown and HTML files retired or documented as the export format'

say "==> done"
if (( DRY_RUN )); then
  echo "Dry run only — nothing was created."
else
  echo "Tracker bootstrapped: https://github.com/$REPO/milestones"
fi
