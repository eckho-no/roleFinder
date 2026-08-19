# web/

The roleFinder Next.js app (App Router), deployed to Cloudflare Workers via
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare). See
[PLAN_2.0.md](../PLAN_2.0.md) and [`docs/adr/0001-stack.md`](../docs/adr/0001-stack.md)
for the stack rationale.

## Local development

```bash
npm install
npm run dev          # next dev, http://localhost:3000
```

## Testing against the Workers runtime locally

```bash
npm run preview       # opennextjs-cloudflare build + wrangler dev, closer to production
```

## Deploy

```bash
npm run deploy        # opennextjs-cloudflare build + wrangler deploy
```

## Other scripts

- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run cf-typegen` — regenerate `cloudflare-env.d.ts` from `wrangler.jsonc` bindings
