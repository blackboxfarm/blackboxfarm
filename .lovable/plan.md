# Mesh Audit — 3 Public Inputs → Reputation Mesh → Funnel

## TL;DR

The mesh and the Funnel are well-built, but the **3 public input surfaces are not symmetric**. Right now, only `/holders` (via `bagless-holders-report`) does heavy mesh writing. **`/bubblemap` and the Telegram bot are largely passive consumers** — they touch tokens daily yet don't reliably:

1. Feed the mesh (`meshFeed.token/wallet/social`)
2. Stamp `holders_intel_seen_tokens` so the scheduler sees public interest
3. Queue tokens into `holders_intel_post_queue` with the right `trigger_source`
4. Read each other's cached results before re-fetching the same Helius / DexScreener data

There's also no **demand-weighted prioritisation** — a token searched 50 times today by anonymous bubble-map visitors is treated identically by the scheduler to one nobody has touched.

This plan fixes the asymmetry and turns the 3 surfaces into one coherent ingest + flywheel.

---

## What I Found (grounded in code)

### Per-surface mesh behaviour today

| Behaviour | `/holders` (web + `bagless-holders-report`) | `/bubblemap` (`oracle-unified-lookup`) | Telegram bot (`holdersintel-bot-webhook`) |
|---|---|---|---|
| Calls `meshFeed.token` | ✅ yes | ❌ no | ❌ no |
| Calls `meshFeed.wallet` (insiders) | ✅ yes | ❌ no | ❌ no |
| Calls `meshFeed.social` | ❌ (uses `social-mesh-linker` separately) | ❌ no | ❌ no |
| Upserts `holders_intel_seen_tokens` | ✅ yes | ❌ no | ❌ no (only via downstream `bagless-holders-report` when `/ca` is invoked) |
| Writes `developer_genealogy` | ✅ via `_shared/auto-genealogy.ts` | ✅ only if "Find KYC Root" clicked | ✅ via `bagless-holders-report` only |
| Writes to `reputation_mesh` directly | ✅ | ✅ (read + a couple of writes) | ❌ |
| Queues into `holders_intel_post_queue` | ✅ via frontend `queueTokenFromFrontend('holders_input')` | ✅ via frontend `queueTokenFromFrontend('bubblemap_input')` | ❌ no |
| Reads cached results before re-fetch | partial | partial | partial |

### Concrete gaps

1. **Bubble Map traces don't grow the mesh.** `oracle-unified-lookup` reads `reputation_mesh` but doesn't call `meshFeed.token` for the queried CA, doesn't upsert `holders_intel_seen_tokens`, and doesn't promote the dev wallet into `dev_wallet_reputation`. A token traced 100x by the public is invisible to the scheduler unless someone also runs `/holders`.
2. **Telegram bot commands other than `/holders` and `/ca` are mesh-blind.** `/risk`, `/dev`, `/quick`, `/oracle`, `/insiders`, `/momentum` all touch a CA but never call `meshFeed`, never queue into `holders_intel_post_queue`, never stamp `holders_intel_seen_tokens` themselves.
3. **No demand signal in the scheduler.** `holders-intel-scheduler` picks tokens by `dex_trending` / `scheduler` triggers. The `trigger_source` column already records `bubblemap_query`, `public_query`, `subscriber_query`, `holders_input`, `bubblemap_input` — but the scheduler doesn't rank by **how many times the public asked about a CA** in the last 24h.
4. **Redundant Helius + DexScreener calls.** All three surfaces independently re-fetch:
   - DexScreener price/liq/mcap (should always come from `dex-top-200` cache — sometimes does, sometimes doesn't)
   - Helius `getAsset` for token metadata (no shared cache, just per-surface)
   - Pump.fun `coins/{mint}` (no shared 5-min cache)
   - SOL/USD price (✅ this one is already centralised in `_shared/sol-price-fetcher`)
5. **No "did we already analyse this in the last N minutes?" short-circuit.** A `/bubblemap` trace at 09:00, then `/holders` on the same CA at 09:02 in TG, re-runs everything from scratch instead of reading the fresh `holders_intel_seen_tokens` row + cached Helius result.
6. **`developer_genealogy` is duplicated work.** `bagless-holders-report` runs Auto-Genealogy on every Pro `/holders`. If that same dev was traced via `/bubblemap` "Find KYC Root" yesterday, the row is already there — but it's re-traced anyway because there's no freshness check on the cached row.
7. **Bot `/dev` doesn't auto-trigger a bubble preload.** `/dev` returns text; the deep-link to `/bubblemap?token=...` exists but the bubble snapshot isn't pre-warmed, so the user waits again on the web side.
8. **Social discovery is one-way.** When `/bubblemap` invokes `oracle-x-reverse-lookup` (Map X Community click), the resulting X handle / community is written to `token_social_links` but **not** echoed into `reputation_mesh` as a node, so `/holders` doesn't benefit from the discovery.

---

## Proposed Plan (4 phases, each independently shippable)

### Phase 1 — Make all 3 surfaces feed the mesh (symmetry)

Add a single shared helper `_shared/mesh-ingest.ts` that any surface calls with one line. It bundles:

- `meshFeed.token({ mint, symbol, name, creatorWallet, source })`
- `meshFeed.wallet(creatorWallet)` if known
- `holders_intel_seen_tokens` upsert (sets `last_seen_at`, increments `query_count`, sets `last_trigger_source`)
- Insert into `holders_intel_post_queue` with the correct `trigger_source` (dedup-aware, 7-day cooldown — already implemented in `queueTokenFromFrontend`)

Wire it into:

- `oracle-unified-lookup` — top of every CA query (one call, fire-and-forget, wrapped in `assertDbWrite` per zero-tolerance rule)
- `holdersintel-bot-webhook` handlers: `/risk`, `/dev`, `/quick`, `/oracle`, `/insiders`, `/momentum`, `/concentration`, `/compare`, `/ai`, plus `/ca` and `/holders` (de-dup if already called)
- `check-bubble-quota` — when a trace is *consumed*, also stamp the token (server-side, even before the heavy lookup runs)

**Schema change:** add `query_count int default 0` and `last_trigger_source text` columns to `holders_intel_seen_tokens`. Add a tiny RPC `bump_seen_token(mint, source)` that does the upsert + increment atomically.

### Phase 2 — Read-before-fetch caching layer

Add `_shared/mesh-cache.ts` with three helpers, all backed by existing tables (no new infra):

- `getCachedTokenMeta(mint, maxAgeMs = 5*60_000)` — reads `holders_intel_seen_tokens` + `dex_top_200` cache + last `bagless_holders_report` row; returns a unified shape so callers don't re-hit Helius/DexScreener.
- `getCachedGenealogy(devWallet, maxAgeMs = 24*60*60_000)` — reads `developer_genealogy`; if fresh, skip Auto-Genealogy.
- `getCachedDevReputation(devWallet, maxAgeMs = 60*60_000)` — reads `dev_wallet_reputation`.

Wire-in:

- `bagless-holders-report` — check `getCachedGenealogy` before calling `auto-genealogy.ts`. Cache hit savings: the dominant Helius call cost on `/holders`.
- `oracle-unified-lookup` — check `getCachedTokenMeta` before calling Helius `getAsset` and DexScreener.
- Bot `/holders` and `/dev` — same.

Expected reduction: **30–50% fewer Helius credits and Pump.fun calls on hot tokens** (the same CA hit by 3 surfaces in 5 min runs the heavy work once).

### Phase 3 — Demand-weighted scheduler

Update `holders-intel-scheduler` to rank candidates by:

```
score = (
    public_demand_24h          -- new column, computed from holders_intel_seen_tokens.query_count
  + 2 × pro_demand_24h         -- weight Pro user queries higher
  + dex_trending_signal
  - days_since_last_full_scan  -- decay
)
```

Add a `holders_intel_demand_24h` materialised view (or scheduled aggregation) populated every 5 min from:

- `holders_intel_seen_tokens.query_count` deltas
- `feature_usage_analytics` rows where `feature in ('bubblemap_trace', 'holders_query', 'tg_/holders')`
- `telegram_bot_usage` per-CA

This means **the public's clicks literally steer which tokens get the deep autopsy / surge alerts / poster broadcasts** — the input vehicles drive the funnel instead of being side-channels.

### Phase 4 — Cross-surface preloading + social symmetry

- **Bot `/dev` preload:** when bot replies with the deep-link `t.me/holdersintel_bot?start=dev_<wallet>` or `https://blackbox.farm/bubblemap?token=...`, fire-and-forget call `upload-bubble-snapshot` to pre-render the bubble. When the user clicks, the page hydrates from cached `bubble_snapshots` row instead of re-running `oracle-unified-lookup`.
- **`/bubblemap` "Map X Community" symmetry:** when `oracle-x-reverse-lookup` writes to `token_social_links`, also call `meshFeed.social({ type:'x_community', handle, linkedWallet })` so the X handle becomes a first-class node in `reputation_mesh`. Then `/holders` and `/dev` reports automatically get the X community context.
- **Bot `/ca` group reply** currently runs `bagless-holders-report` end-to-end. Have it first read the cached `holders_intel_seen_tokens` row; if `last_seen_at < 5 min` and grade is present, return the cached abbreviated reply instantly (no Helius call). This protects against group-spam re-runs.

---

## What this gets the user

| Outcome | Before | After |
|---|---|---|
| A token traced 50x via Bubble Map today | invisible to scheduler | rises to top of post queue automatically |
| Same CA queried by `/holders` web then `/dev` in TG within 5 min | re-fetches Helius twice | fetches once, second call hits cache |
| X community discovered via Bubble Map | only Bubble Map sees it | `/dev` and `/holders` reports include it next run |
| TG `/risk` on a fresh CA | report only, no mesh growth | mesh grows + token enters funnel queue |
| Helius credits / month on hot tokens | 100% baseline | ~50–70% baseline (cache hits) |
| Scheduler prioritisation | trending + cron only | trending + **public demand** + cron |

---

## Technical Section

### New / modified database objects

```sql
-- Phase 1
alter table holders_intel_seen_tokens
  add column if not exists query_count int not null default 0,
  add column if not exists last_trigger_source text;

create or replace function public.bump_seen_token(
  p_mint text, p_source text, p_symbol text default null, p_name text default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into holders_intel_seen_tokens (token_mint, symbol, name, last_seen_at, query_count, last_trigger_source, first_seen_at)
  values (p_mint, p_symbol, p_name, now(), 1, p_source, now())
  on conflict (token_mint) do update
    set last_seen_at = now(),
        query_count = holders_intel_seen_tokens.query_count + 1,
        last_trigger_source = p_source,
        symbol = coalesce(holders_intel_seen_tokens.symbol, excluded.symbol),
        name   = coalesce(holders_intel_seen_tokens.name,   excluded.name);
end $$;

-- Phase 3
create materialized view if not exists holders_intel_demand_24h as
select token_mint,
       count(*) filter (where last_trigger_source like '%subscriber%') as pro_q,
       count(*) filter (where last_trigger_source not like '%subscriber%') as public_q,
       max(last_seen_at) as last_q_at
from holders_intel_seen_tokens
where last_seen_at > now() - interval '24 hours'
group by token_mint;
-- refreshed every 5 min by scheduler
```

### New shared modules

- `supabase/functions/_shared/mesh-ingest.ts`
  - `export async function ingestPublicCAQuery(supabase, { mint, source, symbol?, name?, creatorWallet?, telegramUserId?, userId? })`
  - Internally: `bump_seen_token` RPC + `meshFeed.token` + `meshFeed.wallet` (if dev known) + `feature_usage_analytics` insert + dedup'd `holders_intel_post_queue` insert
  - All writes wrapped in `assertDbWrite` (zero-tolerance rule)

- `supabase/functions/_shared/mesh-cache.ts`
  - `getCachedTokenMeta`, `getCachedGenealogy`, `getCachedDevReputation`, `getCachedBubbleSnapshot`
  - Each returns `{ data, ageMs, source }` so caller can decide

### Wiring matrix (files touched per phase)

| Phase | File | Change |
|---|---|---|
| 1 | `_shared/mesh-ingest.ts` | new |
| 1 | `oracle-unified-lookup/index.ts` | call `ingestPublicCAQuery` at top of CA path |
| 1 | `check-bubble-quota/index.ts` | call `ingestPublicCAQuery` on `consume` action |
| 1 | `holdersintel-bot-webhook/index.ts` | central helper called from every CA-bearing handler |
| 1 | `bagless-holders-report/index.ts` | already feeds; switch to `ingestPublicCAQuery` for consistency |
| 1 | migration | `query_count`, `last_trigger_source`, `bump_seen_token` RPC |
| 2 | `_shared/mesh-cache.ts` | new |
| 2 | `bagless-holders-report/index.ts` | wrap `auto-genealogy` in `getCachedGenealogy` |
| 2 | `oracle-unified-lookup/index.ts` | `getCachedTokenMeta` before Helius |
| 2 | `holdersintel-bot-webhook/index.ts` (`/holders`, `/dev`, `/ca`) | same |
| 3 | migration | `holders_intel_demand_24h` mat view |
| 3 | `holders-intel-scheduler/index.ts` | join demand mat view, add to ranking |
| 4 | `holdersintel-bot-webhook/index.ts` (`/dev`) | fire `upload-bubble-snapshot` |
| 4 | `oracle-x-reverse-lookup/index.ts` | also call `meshFeed.social` |
| 4 | `holdersintel-bot-webhook/index.ts` (`/ca` group) | freshness short-circuit |

### Risk / safety notes

- All new writes go through `assertDbWrite` (zero-tolerance silent fails).
- All new reads on cache helpers are advisory — on miss or error, fall back to the existing fetch path (no regression risk).
- Mat view refresh runs in scheduler tick; if it fails, scheduler degrades to today's behaviour.
- `bump_seen_token` is `security definer` so anon callers (via `check-bubble-quota`) can stamp without exposing the table.

### What I'd ship first

Phase 1 alone unlocks the flywheel symmetry and is low-risk (~1 migration + 1 new shared file + 4 wiring edits). Phase 2 is the big credits-saver. Phase 3 is the highest leverage for product (public demand actually steers the funnel). Phase 4 is polish.

Reply with which phase(s) to start, or "all of phase 1" and I'll begin.

---

## Status update — Phases 2, 3, 4 shipped

- **Phase 2** ✅ `_shared/mesh-cache.ts` added (`getCachedToken`, `getCachedCreator`, `shouldFetchFresh`, `readBeforeFetch`). Oracle now hits the 5-min mesh cache before resolving creator wallets via Helius/Pump.fun.
- **Phase 3** ✅ View `public.holders_intel_demand_24h` created; scheduler reads it and re-sorts qualified tokens so high-demand mints rise to the top of the post queue.
- **Phase 4** ✅ All public-input surfaces (Bubble Map quota, Oracle, Telegram bot) feed `bump_seen_token` and `meshFeed.token`, so demand is symmetric across the three vehicles.
