# roleFinder

A gated job-search tracker on Cloudflare Workers, with an agentic pipeline that
extracts, scores, deduplicates and critiques listings — and an eval harness that
measures whether the scoring agent actually agrees with a human.

**Status:** planning complete, build not started. See
[PLAN_2.0.md](PLAN_2.0.md).

---

## Why

The job search it replaces runs as a hand-maintained markdown file plus a static
HTML dashboard. Every session an LLM re-reads the whole file, re-runs 12 saved
queries, re-scores new listings against a 6-axis rubric by hand, and writes a
new version. It works, and it doesn't scale: no querying, no history beyond
prose diffs, no way to act from a phone, and the agentic work is redone from
scratch every time.

## What it is

| | |
|---|---|
| **Runtime** | Next.js (App Router) on Cloudflare Workers via OpenNext |
| **Data** | D1 (SQLite) + Drizzle ORM |
| **Vectors** | Cloudflare Vectorize, embeddings from Workers AI (`bge-base-en-v1.5`) |
| **Generation** | Anthropic Messages API (direct `fetch`, edge-safe) |
| **Async** | Cloudflare Queues + Cron Triggers |
| **Auth** | Single-password gate, HMAC cookie via Web Crypto, KV rate limit |

### The agents

- **Extraction** — pasted JD → structured listing draft (never auto-saved)
- **Scoring** — listing + current rubric → per-axis scores, tier, rationale
- **Currency / duplicate** — is this still live, and is it a re-post?
- **RAG chat** — ask questions across the board, answers cite listings
- **Orchestrator** — calls the above as tools, including web research when
  salary is unstated, then re-scores
- **Coach** — weekly; chases unanswered judgment calls and proposes rubric
  changes you explicitly approve or reject

Every hop is logged with model, tokens, cost and latency, and rendered as a
live call tree on the listing page.

### The eval harness

The scoring agent is measured against ~25 real JDs with human scores, reporting
per-axis MAE, tier-agreement rate and a confusion matrix. CI fails on
regression. Without it, "the coach improves the rubric" would be unfalsifiable.

## Privacy

This repo is public. Committed fixtures are synthetic, eval fixtures are
anonymised, and the real board exists only in the deployed database. A
`check:privacy` deny-list runs as a pre-commit
hook and as a CI job. See [PLAN_2.0.md §3](PLAN_2.0.md).

## Build phases

Tracked as GitHub milestones M0–M11 — see
[Issues](https://github.com/eckho-no/roleFinder/issues) and
[Milestones](https://github.com/eckho-no/roleFinder/milestones).

`M0` foundations · `M1` deploy spine · `M2` data model · `M3` auth ·
`M4` read-only app · `M5` agent core · `M6` eval harness · `M7` retrieval ·
`M8` ingestion · `M9` orchestration · `M10` coach · `M11` cutover

The deploy spine is phase 1, not phase 10 — the riskiest integration gets
validated before anything is built on it.
