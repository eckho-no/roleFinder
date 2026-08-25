# ADR-0005: Keep the `middleware.ts` file convention, not `proxy.ts`

**Status:** accepted
**Date:** 2026-08-25

## Context

Next.js 16.3.1 (this repo's pinned version) renamed the `middleware.ts` file
convention to `proxy.ts` and, per
`node_modules/next/dist/build/analysis/get-page-static-info.js`, hard-locks
any `proxy.ts` file to the Node.js runtime — setting `export const runtime`
(or the `config.runtime` route segment option) in a Proxy file throws a
build error ("Proxy always runs on Node.js runtime"). There is no supported
way to opt a `proxy.ts` file back into the Edge runtime.

`@opennextjs/cloudflare@1.20.2` (this repo's pinned adapter version) does not
support Node.js middleware yet:
`@opennextjs/cloudflare/dist/cli/build/build.js` calls `useNodeMiddleware()`
and exits the build with "Node.js middleware is not currently supported.
Consider switching to Edge Middleware." whenever it detects one.

Issue #21 initially implemented the auth gate as `proxy.ts` (the current,
non-deprecated convention — `web/AGENTS.md` explicitly warns to check the
vendored docs rather than assume training-data APIs still apply, and
`proxy.ts` is what those vendored docs recommend). `next build` succeeds
with it. `npx opennextjs-cloudflare build` — the actual step CI's `web` job
and `npm run deploy` run — does not; it hits the "Node.js middleware" error
above and exits 1. This wasn't caught in local verification during #21
because `npm run build` only runs `next build`, not
`opennextjs-cloudflare build`; CI caught it on PRs #82 and #83.

## Decision

Use `middleware.ts`, not `proxy.ts`, despite the deprecation warning at
build time. The legacy file convention still defaults to (and, unlike
`proxy.ts`, still permits configuring) the Edge runtime, which is what
`@opennextjs/cloudflare`'s current build actually supports.

## Alternatives considered

- **`proxy.ts` with the Node.js runtime.** Not possible today — OpenNext's
  Cloudflare adapter rejects it outright at build time, not something this
  app's code can work around.
- **Downgrade Next.js to a pre-16 version.** Rejected — this repo already
  requires web-searching current tool versions before scaffolding (M1,
  `web/AGENTS.md`); deliberately regressing to dodge one incompatibility
  trades a known, narrow issue for an unknown set of older-version ones.
- **Wait for `@opennextjs/cloudflare` to add Node.js middleware support.**
  The actual long-term fix, but not something to block M3 on. Revisit this
  ADR (migrate `middleware.ts` → `proxy.ts`) once a release note confirms
  support.

## Consequences

- `npm run build` (`next build` alone) is **not sufficient** to catch this
  class of failure — it doesn't run the OpenNext Cloudflare build step.
  Local pre-PR verification should include `npx opennextjs-cloudflare
  build` (or `npm run preview`, which runs it) whenever a change touches
  middleware/proxy, not just `npm run build`.
- A build-time deprecation warning ("The middleware file convention is
  deprecated. Please use proxy instead.") is expected and accepted until
  the OpenNext adapter catches up.
- When `@opennextjs/cloudflare` does add Node.js middleware support,
  migrating is mechanical: `npx @next/codemod@canary middleware-to-proxy .`
  per Next's own migration doc.
