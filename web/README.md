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

## Database

```bash
npm run db:generate              # drizzle-kit generate — new migration from src/db/schema
npx wrangler d1 migrations apply rolefinder-db --local   # or --remote
npm run seed                     # load fixtures/seed.synthetic.json into local D1
npm run seed -- --remote         # ...or into the deployed (production) D1
npm run seed:generate-fixture    # regenerate fixtures/seed.synthetic.json itself
```

`fixtures/seed.synthetic.json` is fully fabricated — see PLAN_2.0.md §3. It's
shaped like the real board (tier distribution, salary-stated ratio, a stale
closed listing, a duplicated req) but contains no real company, score, or
listing data.

## Other scripts

- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run cf-typegen` — regenerate `cloudflare-env.d.ts` from `wrangler.jsonc` bindings
