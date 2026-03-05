# 2045-engine

Production-grade Node.js newsletter automation engine.

## What it does
One command runs: **discover → select → write → publish → generate micro posts → persist assets**.

Integrations:
- Hacker News RSS
- Reddit JSON (no OAuth)
- Optional YouTube Data API v3 search (graceful skip)
- OpenAI writing (newsletter + social only)
- Beehiiv post creation
- Postgres persistence (Supabase-compatible `DATABASE_URL`)

## macOS setup
1. Install Node.js 18+ (via `brew install node` or nvm).
2. Clone repo and install dependencies:
   ```bash
   npm install
   ```
3. Configure env:
   ```bash
   cp .env.example .env
   # edit .env with your keys
   ```
4. Run migrations:
   ```bash
   npm run migrate
   ```
5. Run weekly/full pipeline once:
   ```bash
   npm run weekly
   ```

## Scripts
- `npm start` → `node index.js run-once`
- `npm run weekly` → full weekly pipeline
- `npm run micro` → regenerate/store micro posts only
- `npm run migrate` → applies `db/schema.sql`
- `npm run dev` → same as weekly

## Cron scheduling (optional)
Set in `.env`:
```bash
ENABLE_CRON=true
TIMEZONE=America/Los_Angeles
```
Schedules in `jobs/scheduler.js`:
- weekly: Sunday 6:00 PM PT
- micro: Mon–Fri 9:00 AM PT

## Required env vars
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (defaults to `gpt-4.1`)
- `DATABASE_URL`
- `BEEHIIV_API_KEY`
- `BEEHIIV_PUBLICATION_ID`

Optional:
- `YOUTUBE_API_KEY`
- `ENABLE_CRON=true|false`
- `PUBLISH_MODE=draft|schedule|publish_now`
- `TIMEZONE=America/Los_Angeles`

## Deterministic guarantees
- Deterministic ingestion/normalization/ranking and engagement scoring.
- Dedup by canonical URL and 30-day filter.
- Selection mechanics deterministic with seeded weighted lottery.
- OpenAI is used only for writing/classic generation.
- QA gate enforces sections, numbers, citations, tense sanity, banned phrase.
- If Beehiiv publish fails: issue assets persist; issue status becomes `publish_failed`; process exits non-zero.

## Data model
`db/schema.sql` creates:
- `signals`
- `issues`
- `issue_signals`
- `issue_assets`
- `runs`

## Commands
```bash
node index.js run-once
node index.js weekly
node index.js micro
```
