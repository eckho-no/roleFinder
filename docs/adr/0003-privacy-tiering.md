# ADR-0003: Three-tier data model for a repo built to go public

**Status:** accepted
**Date:** 2026-08-19

## Context

The repo is private today, but it's a portfolio project, and the whole point
of a portfolio project is to eventually be seen. The real tracker data this
app is built on contains a salary floor, a home area and commute radius, a
list of not-commutable towns, candid company commentary, a personal
skills-gap list, and a career decision date — none of which should ever be
public, and none of which is needed for the app to be a convincing
demonstration of the engineering.

The failure mode being designed against is specific: commit real data now
while the repo is private, flip it to public later, and every commit since
day one goes public with it. Deleting a file at that point does nothing —
git history is what gets cloned, and a `git filter-repo` rewrite after the
fact is exactly the kind of unplanned, error-prone cleanup this ADR exists
to avoid needing.

## Decision

Three tiers, enforced at commit time:

1. **Committed, synthetic** — `fixtures/seed.synthetic.json`. Fabricated
   companies, roles, locations and scores that match the real board's
   *shape* (tier distribution, salary-stated ratio, duplicate and
   stale-listing patterns) without containing any real value. This is what
   CI seeds, what demo mode serves, and what a reader of the repo sees.
2. **Committed, anonymised** — `fixtures/evals/*.json`. Real job-description
   text with company names, URLs, and identifying detail replaced by stable
   pseudonyms, paired with real human scores. Necessary because the eval
   harness (M6) is meaningless against synthetic JDs — it has to be tested
   against real scoring judgment, just with the identity stripped out.
   Reviewed by hand before every commit.
3. **Never committed** — `data/private/` (gitignored), the real markdown
   tracker, the real seed, and anything derived from them. The real board
   exists only in the deployed D1 instance, never in git.

Enforcement is mechanical, not just documented intent: `.gitignore` covers
the known private filenames and patterns, `check:privacy` greps staged
content against a deny-list (M0, issues #2/#3), and the deny-list's own
tokens live in a gitignored local file so the enforcement tool doesn't leak
what it protects.

## Alternatives considered

- **Keep the repo private indefinitely, don't bother with tiering.** Simplest
  short-term, but defers the actual goal (a public portfolio piece) and
  means the discipline has to be retrofitted later under time pressure,
  which is exactly when mistakes happen. Rejected — the tiering costs little
  now and a lot more later.
- **Commit real data, rely on making the repo public being a manual,
  careful, one-time review.** Rejected per the failure mode above: history
  doesn't forget, and a single missed commit during that "careful review"
  permanently leaks it.
- **Encrypt private data at rest in the repo (e.g. git-crypt).** Adds a key-
  management problem for a single-user project and still requires trusting
  that the plaintext never briefly touches a commit pre-encryption. The
  gitignore-plus-deny-list approach is simpler and has no key to lose.

## Consequences

- Every fixture, doc, and ADR in this repo has to describe real findings by
  pattern ("one recruiter req surfacing three times in a run") rather than
  by name — this applies to prose as much as to data files, including this
  ADR and PLAN_2.0.md itself.
- The eval harness (M6) depends on hand-anonymising ~25 real JDs before it
  can be built — a real, human-hours cost that automated tooling can't fully
  remove, since pseudonymisation needs judgment about what counts as
  identifying.
- `check:privacy`'s deny-list is itself sensitive and lives only locally
  until M2's markdown→seed converter can help maintain it — until then it's
  a manually curated file, which means it's only as complete as the person
  maintaining it remembers to make it.
