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

**Two D1 databases, not one** — see [`docs/adr/0004-demo-data-isolation.md`](../docs/adr/0004-demo-data-isolation.md).
`rolefinder-db` (`DB` binding) holds real data only. `rolefinder-demo-db`
(`DEMO_DB` binding) holds the synthetic fixture only. Every migration needs
applying to both.

```bash
npm run db:generate                                       # drizzle-kit generate — new migration from src/db/schema
npx wrangler d1 migrations apply rolefinder-db --local     # repeat for --remote,
npx wrangler d1 migrations apply rolefinder-demo-db --local  #  and for the demo db

npm run seed                                               # synthetic fixture -> local rolefinder-db (default)
npm run seed -- --db rolefinder-demo-db                    # synthetic fixture -> local demo db (the real target)
npm run seed -- --remote --db rolefinder-demo-db           # ...or the deployed demo db
npm run seed:generate-fixture                               # regenerate fixtures/seed.synthetic.json itself

npm run seed:convert-private -- ../job-search-tracker-*.md  # real tracker -> data/private/seed.local.json (gitignored)
npm run seed -- --file ../data/private/seed.local.json --db rolefinder-db --remote  # -> production only, never the demo db
```

`fixtures/seed.synthetic.json` is fully fabricated — see PLAN_2.0.md §3. It's
shaped like the real board (tier distribution, salary-stated ratio, a stale
closed listing, a duplicated req) but contains no real company, score, or
listing data.

## Other scripts

- `npm run lint` — ESLint
- `npm run typecheck` — `tsc --noEmit`
- `npm run cf-typegen` — regenerate `cloudflare-env.d.ts` from `wrangler.jsonc` bindings
