# Session handoff — roleFinder

> Written 2026-08-19 at the end of the planning session.
> **Delete this file once M1 is underway** — it describes a moment, not the project.
> The durable documents are [PLAN_2.0.md](PLAN_2.0.md) and (once written) `AGENTS.md`.

---

## Where things stand

Planning is complete. No application code exists yet. Four files are committed
across three local commits; **nothing has been pushed**.

```
.gitignore                    privacy guardrails
PLAN_2.0.md                   the design — single source of truth
README.md                     project overview
scripts/bootstrap-github.sh   creates 20 labels, 12 milestones, 59 issues
```

Commits, oldest first:

```
c59f65c docs: add build plan v2.0 and privacy guardrails
4630a7f chore: add idempotent GitHub tracker bootstrap script
a8cffd7 docs: reflect private repo, keep public-safe discipline
```

---

## Do these two things first

Nothing else can start until the tracker exists.

```bash
cd ~/Documents/Projects/roleFinder
git push -u origin main          # remote already set to git@github.com:eckho-no/roleFinder.git
scripts/bootstrap-github.sh      # idempotent; --dry-run to preview
```

Then verify and begin at **M0**:

```bash
gh issue list --repo eckho-no/roleFinder --milestone "M0 — Foundations"
```

**Why these weren't already run:** the previous session hit a permission
classifier that blocked `git push` and all `gh` write operations. The block was
reported as stemming from earlier conversation content rather than the actions
themselves, i.e. session-scoped. Local commits worked fine throughout. If a
fresh session still can't push, that's new information worth surfacing to the
user rather than working around.

---

## Environment

| | |
|---|---|
| OS | Ubuntu 24.04 |
| Node | v22.23.1 (via nvm) |
| `gh` | 2.45.0, authenticated as `eckho-no`, scopes `gist read:org repo workflow` |
| SSH | `~/.ssh/id_ed25519` registered to `eckho-no`, authenticates to GitHub |
| sudo | **password-required** — no unattended `apt install` |
| Repo | `eckho-no/roleFinder` — **private**, empty on GitHub, issues enabled |

The `workflow` scope is present, so pushing `.github/workflows/*` in M1 will work.

---

## Non-negotiable: three files must never be committed

```
PLAN.md                                  v1.0 plan; names real companies with real scores
job-search-tracker-v8_0-2026-08-19.md    the live tracker — salary floor, home area, commentary
job-search-dashboard-v8_0.html           rendered from the above
```

All three are gitignored and confirmed ignored. The repo is private *today*, but
the plan is built around it being safely flippable to public — committing real
data now would publish the entire history the moment that happens, and deleting
a file later does not remove it from history.

**This applies to prose, not just data files.** Documentation refers to real
listings by pattern ("one recruiter req surfacing three times in a run") rather
than by company name and score. A named employer paired with a private score is
board data regardless of which file it sits in.

Before any commit that touches `.gitignore`, `.env*`, config, or fixtures, run
the `secrets-guard` skill. It has already caught one real issue here: unanchored
`build/` and `dist/` patterns that would have swallowed future nested source
directories (fixed — they are `/build/` and `/dist/` now).

`check:privacy` — the automated deny-list — **does not exist yet**. It is the
second M0 issue. Until it lands, enforcement is manual. This stops being
adequate at M2, when the private markdown-to-seed converter starts producing
real data locally.

---

## Build order

Phases are GitHub milestones. Full detail with exit criteria in PLAN_2.0.md §5.

```
M0  Foundations       ← start here; mostly local files, no network needed
M1  Deploy spine        risk-first: prove OpenNext-on-Workers before building on it
M2  Data model          one migration, everything included
M3  Auth                constant-time compare, signed cookie, KV rate limit, demo mode
M4  Read-only app       deadline rail first
M5  Agent core          dispatcher with hop + budget caps, then extraction and scoring
M6  Eval harness        the highest-leverage phase — see below
M7  Retrieval           embeddings, reconcile, RAG chat
M8  Ingestion           Adzuna/Reed via queue-backed cron
M9  Orchestration       agents as tools, streamed trace panel
M10 Coach               reflection queue, n-gated calibration
M11 Cutover             markdown export, parity check
```

M0's six issues are almost all local file writes — `AGENTS.md`, the
`check:privacy` script and its hook, three ADRs, issue/PR templates, LICENSE.
None need the network. It is a clean first session.

---

## Design decisions a new session must not quietly reverse

These were argued for specifically. Changing them is fine; changing them by
accident is not. Write an ADR if you deviate.

- **Deploy is M1, not last.** OpenNext-on-Workers is the riskiest integration.
  It gets validated before anything is built on it.
- **The rubric is data, not columns.** `profile_config.axes` is JSON; `scores.axes`
  is JSON keyed to it. This is what lets the coach agent propose a new scoring
  axis without a migration — which is its flagship use case.
- **`scores.profile_config_id` is a real FK.** Without it a score is not
  reproducible.
- **`status` (lifecycle) is separate from `triage` (workflow).** The single
  largest category of real entries — surfaced but never scorable — needs
  `status: unknown, triage: logged_only`. One combined column cannot express it.
- **D1 has no enums.** Every union field is TEXT plus a TypeScript union and a
  validator at the boundary.
- **Every Claude call goes through `invokeAgent`.** A direct fetch in a route
  handler puts a hole in the trace, the hop limit and the budget cap at once.
- **Cron produces to a Queue; it does not do the work inline.** Fetch-plus-Claude
  across 40+ listings will exceed Worker CPU and subrequest limits.
- **Indeed and LinkedIn are paste-in, not scraped.** Adzuna and Reed have real
  APIs and get automated. Automate the extraction, not the acquisition.
- **The eval harness is not optional.** Without it, "the coach improves the
  rubric" is unfalsifiable — you cannot distinguish improvement from regression.
  It also closes a gap the user's own tracker lists as outstanding.
- **Nothing auto-applies.** Extraction returns a draft; coach config diffs need
  explicit approval.

---

## Open items the user may want to revisit

1. **Company names were sanitised out of the plan prose.** Applied when the repo
   was expected to be public; it was created private instead. The user was
   offered a revert and has not taken it. Do not restore them unilaterally.
2. **LICENSE not chosen.** First M0 issue; README assumes MIT unless told
   otherwise.
3. **The markdown loop is still the system of record.** The user decided the
   v8.x tracker keeps running in parallel until parity at M11. Nothing in this
   build is on the critical path for their end-of-August 2026 decision date —
   do not rush phases on the assumption that it is.

---

## Context worth having

The app replaces a hand-maintained markdown tracker plus a static HTML
dashboard. Every session an LLM re-reads the whole file, re-runs 12 saved
queries plus a Gmail sweep, re-scores listings against a 6-axis rubric by hand,
and writes a new version.

Two details that drove real design decisions:

- **Listings expire mid-deliberation.** Two already have. This is why
  `expires_at` exists and why the deadline rail is the top element of the
  dashboard rather than a nice-to-have.
- **A closed listing kept resurfacing for twelve days** after being confirmed
  closed, caught only because a human noticed run after run. This is why
  `sightings` is a table rather than two timestamp columns.

The existing dashboard's colour tokens (`--ink`, `--paper`, `--act`,
`--consider`, `--skip`, `--stale`) should carry over for visual continuity —
read them from the gitignored HTML file locally; do not commit it.
