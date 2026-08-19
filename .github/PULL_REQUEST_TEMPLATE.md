## Summary

<!-- What changed and why, in a sentence or two. -->

## Test plan

<!-- How this was verified. Checkboxes for each acceptance criterion covered. -->

- [ ]

## Edge-safety checklist

<!-- See AGENTS.md §6. Check off or mark N/A. -->

- [ ] No module-scope mutable state
- [ ] No `node:crypto`
- [ ] No self-referencing `fetch` to the app's own `/api/*`
- [ ] No unbounded loops in a cron or queue consumer handler
- [ ] No real company names, scores, salary figures, or location details in code, docs, or this PR description

Closes #
