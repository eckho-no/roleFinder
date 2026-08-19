# AGENTS.md

Operating rules for any agent (or human) building roleFinder. This codifies
[PLAN_2.0.md §6](PLAN_2.0.md#6-agent-operating-rules) and §7 as the actual
contract, not just a design note. If something here and PLAN_2.0.md ever
disagree, PLAN_2.0.md is the source of truth for *what* to build; this file is
the source of truth for *how* to work.

---

## 1. Setup

```bash
npm run hooks:install    # once, per clone — wires the pre-commit privacy check
```

## 2. Branch, commit, and PR conventions

- **One GitHub issue → one branch → one PR.** Branch name
  `<type>/<issue#>-<slug>`, e.g. `feat/23-deadline-rail`.
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/),
  `type(scope): subject`, imperative mood. `type` matches the issue's
  `type:` label where practical (`feat`, `fix`, `chore`, `infra`, `schema`,
  `agent`, `docs`, `test`).
- **PR body includes `Closes #<issue>`.**
- If an issue depends on another that hasn't merged yet, branch from that
  issue's branch (a stacked PR) rather than duplicating its changes, and say
  so in the PR description with a note to retarget once the base merges.
- **CI must be green before merge** (from M1 onward, once real CI exists
  beyond the M0 privacy check).
- **Update the issue before closing it** with what actually shipped,
  including anything descoped. A closed issue that quietly dropped half its
  acceptance criteria is worse than an open one.
- **Deploy after every milestone**, not at the end (from M1 onward).

## 3. Never commit real job-search data

The repo is private today but built to be safely flippable to public — see
PLAN_2.0.md §3. Real data never enters git, in data files or in prose.

- `check:privacy` must pass. If it fails, fix the data — **don't weaken the
  deny-list** to make it pass.
- Never restore company names, scores, salary figures, or location details
  into committed prose. If PLAN_2.0.md or this file ever need a concrete
  example, use a pattern ("one recruiter req surfacing three times in a
  run") instead of a real name.
- The gitignored local deny-list (`scripts/privacy-denylist.private.txt`)
  is itself sensitive by construction — never commit it, never paste its
  contents into an issue, PR, or commit message.

## 4. Never commit secrets

- All secrets via `wrangler secret put`. Plain (non-secret) config lives in
  `wrangler.jsonc` `vars`.
- Run the `secrets-guard` skill before any push that touches `.gitignore`,
  `.env*`, or config.

## 5. Migrations are append-only

Once M2 ships the first migration, never edit an applied migration. A schema
change is a new migration file.

## 6. Edge-safety sweep before every PR

Cloudflare Workers isolates don't behave like a long-lived Node process.
Before opening a PR, check the diff for:

- No module-scope mutable state (isolates don't share memory — use D1, KV,
  or Durable Objects, not a global variable).
- No `node:crypto` — Web Crypto (`crypto.subtle`) only.
- No self-referencing `fetch` to the app's own `/api/*` routes.
- No unbounded loops in a cron or queue consumer handler.

## 7. Every agent call goes through `invokeAgent`

No direct Anthropic `fetch` in a route handler, ever — it puts a hole in the
trace, the hop limit, and the daily budget cap all at once. This applies from
M5 onward.

## 8. Other locked decisions (see PLAN_2.0.md §0 for full rationale)

- Deploy spine is M1, not last.
- The rubric (`profile_config.axes`) is data, not columns.
- D1 has no enums — every union field is TEXT plus a TypeScript union and a
  boundary validator.
- Cron produces to a Queue; it never does the work inline.
- Indeed and LinkedIn are paste-in, not scraped. Adzuna and Reed get real API
  clients.
- Nothing auto-applies — extraction drafts and coach config diffs need
  explicit human approval.

## 9. When a phase's assumption turns out wrong

Write an ADR (`docs/adr/`) rather than silently deviating. See
`docs/adr/0000-template.md`.
