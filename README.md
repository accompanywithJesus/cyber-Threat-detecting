# Cyber Atlas

A geopolitical cyber threat observatory. Cyber Atlas collects security news from
public RSS feeds, enriches each article with severity, category, geography and
MITRE ATT&CK group matches, and plots the result on an interactive 3D globe
alongside a curated dataset of registered APT groups.

The interface is in Korean; the codebase and documentation are in English.

**Stack:** [vinext](https://github.com/cloudflare/vinext) (Next.js App Router
compatibility layer) on Cloudflare Workers · Cloudflare D1 + Drizzle ORM ·
three.js + three-globe · React 19.

## Features

- **Live OSINT collection** — three RSS sources are fetched in parallel, each
  isolated so one dead feed cannot take down the rest.
- **Automatic enrichment** — keyword-based severity and category inference,
  MITRE ATT&CK group matching by official alias, and country/region inference
  producing an estimated attacker → target pair.
- **Persistent archive** — every collection run upserts into D1 keyed on article
  link, so the observatory accumulates a time series instead of starting fresh
  on each request.
- **Never goes blank** — if every feed fails (blocked egress, upstream outage),
  the API serves the stored archive and flags the response `degraded`, which the
  UI surfaces as an explicit archive-fallback banner.
- **ATT&CK case layer** — nine China-linked APT groups with attacker → C2 →
  target coordinates, techniques, software and source references drawn from
  MITRE ATT&CK.

## Requirements

- Node.js `>=22.13.0`
- A Cloudflare account (for deployment)

## Local development

```bash
npm install
npm run db:migrate:local   # apply the schema to the local D1 instance (once)
npm run dev                # http://localhost:3000
```

## Deployment

This repository is not tied to any managed platform. It deploys directly to
Cloudflare Workers.

```bash
wrangler login             # once, interactive OAuth
npm run db:create          # create the D1 database
```

Copy the `database_id` printed by `db:create` into `d1_databases[0].database_id`
in `wrangler.jsonc`, then:

```bash
npm run db:migrate         # apply migrations to the remote D1
npm run deploy             # build and deploy
```

Use `npm run deploy:dry` to validate the config, bundle and bindings **without
authenticating** — it is the fastest way to diagnose a broken deploy.

`wrangler.jsonc` is the single source of truth for the worker name and its
bindings. At build time `@cloudflare/vite-plugin` copies it to
`dist/server/wrangler.json`, which is the config `npm run deploy` hands to
wrangler.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Local dev server with D1 bindings |
| `npm run build` | Production build |
| `npm test` | Build, then run the API contract suite |
| `npm run lint` | ESLint |
| `npm run deploy` | Build and deploy to Cloudflare Workers |
| `npm run deploy:dry` | Validate the deploy without authenticating |
| `npm run db:create` | Create the D1 database |
| `npm run db:generate` | Generate migration SQL from schema changes |
| `npm run db:migrate` | Apply migrations to the remote D1 |
| `npm run db:migrate:local` | Apply migrations to the local D1 |

## Tests

`tests/api-contract.test.mjs` loads the built Worker and drives it the way the
Cloudflare runtime does. Outbound `fetch` is stubbed so feed behaviour is
deterministic, and D1 is backed by Node's built-in SQLite, so real SQL runs
against the real migration.

The suite covers the response contract of `/api/news` and `/api/history`, the
enrichment pipeline, link-keyed upserts, `/api/history` soft-failure and input
validation, and — most importantly — that a total feed outage falls back to the
stored archive instead of emptying the map.

```bash
npm test
```

## Project layout

```
app/
  page.tsx              single client shell (state, filters, detail panel)
  components/           ThreatGlobe (three-globe renderer)
  data/                 mitre-groups.json (curated APT dataset)
  api/news/             RSS collection, enrichment, D1 upsert, archive fallback
  api/history/          time-series queries over the archive
  api/region-intel/     historical search via Google News RSS
db/                     Drizzle schema and D1 client
drizzle/                generated migrations
tests/                  API contract suite
worker/index.ts         Workers fetch entry point
wrangler.jsonc          worker name and bindings
```

Project context and roadmap live in [CLAUDE.md](CLAUDE.md).

## Known limitations

- **Collection is request-triggered, not scheduled.** Articles accumulate only
  when someone hits `/api/news`. Moving ingestion to a Cron Trigger is the next
  planned step.
- **Attribution is heuristic, not authoritative.** Target and origin countries
  are inferred from the order in which place names appear in the text, so they
  can invert. `geoConfidence` reflects match presence, not calibrated
  confidence. Nothing here should be read as formal attribution.
- **Worker bundle is larger than it needs to be.** `three` and `three-globe` are
  client-only but are pulled into the SSR graph, inflating the upload to roughly
  1.3 MB gzipped (the free-tier limit is 3 MB). Excluding them from the server
  build is a known improvement.
