## Problem

We hit DexScreener's boost endpoints in 4 places (`dexscreener-trending-banners`, `dexscreener-top-200-scraper`, `get-banner-for-position`, `holders-intel-dex-scanner`) but **never persist a per-token boost history**. `boost_entries` is a manual admin table. `dex_paid_status` (queried by `autopsy-enrich`) doesn't even exist — silent zero. Result: $UNCRAFT's 500x boost on April 22 never reached the autopsy.

Also: TG/X scrape evidence is regex-only — no AI interpretation of message content for boost/marketing mentions.

## Plan

### 1. New table: `token_boost_history`
Per-token, per-snapshot boost events (idempotent, time-series).

```
token_mint            text
chain_id              text default 'solana'
captured_at           timestamptz default now()
boost_amount          int          -- "amount" from API (current tier)
total_amount          int          -- "totalAmount" cumulative
delta_amount          int          -- computed vs previous row for token
source                text         -- 'top' | 'latest' | 'orders'
icon_url, header_url, description, links jsonb
raw                   jsonb
unique (token_mint, captured_at)
index (token_mint, captured_at desc)
```

Plus `token_paid_orders` for `/orders/v1/solana/{mint}` results (tokenProfile, communityTakeover, tokenAd, trendingBarAd, boost):
```
token_mint, order_type, status, amount, payment_timestamp, raw, captured_at
unique (token_mint, order_type, payment_timestamp)
```

### 2. New edge function: `dexscreener-boost-poller` (cron, every 5 min)
- GET `/token-boosts/latest/v1` and `/token-boosts/top/v1` → upsert into `token_boost_history` with `source='latest'|'top'` for every Solana token.
- Compute `delta_amount` vs the most recent prior row for that mint — when delta > 0, that's a boost event we can post / feed Mesh.
- For tokens already in our `token_lifecycle` / watchlist, additionally call `/orders/v1/solana/{mint}` and upsert into `token_paid_orders`.
- Emit a row into `funnel_feed_discoveries` (or existing equivalent) when a tracked token gets a positive delta — this restores the X/TG posting trigger you remembered.

Cron: pg_cron every 5 minutes. Self-throttled, fail-open.

### 3. Backfill on demand
`autopsy-enrich` and `autopsy-writer` will:
- Read `token_boost_history` aggregated (sum of deltas, max tier, first/last boost date) → populate `boosts_paid_usd` style fields properly with **timeline**, not a single number.
- Read `token_paid_orders` for dex-paid / CTO / ads booleans + dates (replaces the missing `dex_paid_status` lookup).
- Pass a `boost_timeline` array into the AI writer prompt so reports cite specific dates ("500x boost on Apr 22").

### 4. AI interpretation of TG/X scrapes
Add `autopsy-evidence-interpret` edge function:
- Input: raw text blobs from `autopsy_evidence_blobs` (TG messages, X posts already captured).
- Calls Lovable AI Gateway (Gemini) with a structured prompt: extract mentions of {boosts, dex paid, marketing campaigns, partnerships, dev statements, sell-the-news}.
- Output upserted as `autopsy_evidence_blobs.kind='ai_interpretation'` with structured JSON.
- `autopsy-writer` includes interpreted findings in its evidence pack.

### 5. Dev reputation enrichment
`autopsy-dev-context.ts` will additionally aggregate `token_boost_history` and `token_paid_orders` across **all prior tokens by the same dev cluster** → "Dev has spent $X on boosts across N tokens" feeds the dossier verdict.

### 6. UI
Add a small "Boost Timeline" panel to `AllDrafts.tsx` per candidate (read-only chart of deltas over time) so you can eyeball before regenerating.

## Files

**New**
- `supabase/migrations/<ts>_token_boost_history.sql` (2 tables)
- `supabase/functions/dexscreener-boost-poller/index.ts`
- `supabase/functions/autopsy-evidence-interpret/index.ts`
- pg_cron schedule (insert tool, not migration — contains URL/anon)

**Edited**
- `supabase/functions/_shared/autopsy-enrich.ts` — read from new tables, build `boost_timeline`
- `supabase/functions/_shared/autopsy-dev-context.ts` — aggregate dev's lifetime boost spend
- `supabase/functions/autopsy-writer/index.ts` — pass timeline + AI-interpreted evidence into prompt
- `src/components/admin/autopsies/AllDrafts.tsx` — boost timeline mini-panel

## Open question

**Polling frequency** — every 5 min is a sweet spot for catching boost transitions without hammering DexScreener's rate limit. OK or do you want 2 min / 10 min?