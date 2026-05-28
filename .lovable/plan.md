## Goal

Stop treating the No Lube post log as the source of truth. The **Insiders channel scrape is the canonical "first seen" event** for every token. Everything else (mesh check, dev wallet discovery, blackbox bot-reply scrape, /holders, private/public posts, X-factor math) flows from that single ingestion.

## Current vs. desired behavior

| | Today | Desired |
|---|---|---|
| First-seen mcap baseline | First successful `no_lube_post_log` row | `telegram_insider_token_lifecycle.entry_market_cap` (captured at scrape time from the Insiders message — $107k QUEENBIRD in the screenshot) |
| Mesh lookup on new token | Not done at ingestion | Run as soon as the CA is parsed |
| Dev wallet discovery | Lazy, hours later via cron | Resolved immediately on first sighting (Pump.fun → Helius DAS → on-chain) and persisted to mesh |
| Blackbox bot-reply scrape | Separate manual aggregator | Auto-fired on first sighting; replies harvested after ~15s and merged into mesh |
| /holders enrichment | Ad-hoc | Run on first sighting AND on every re-sighting (only dynamic data refreshes) |
| Private vs public posting | OK | Keep, but use the richer enriched payload + Insiders entry_mcap for the X factor |
| Re-sighting "X factor" | `current_mcap / first_no_lube_post_mcap`, milestone-gated | `current_mcap / insiders_entry_market_cap`, milestone-gated (2x → 3x → 4x …) |

## New lifecycle (single source of truth)

```text
Insiders TG msg arrives
  │
  ▼
insiders-lifecycle-builder
  ├─ writes telegram_insider_token_lifecycle row
  │    (token_mint, ticker, entry_market_cap, age, top10, security, image_url, first_called_at)
  └─ enqueues new-token job ──▶ no-lube-ingest  (new function)
                                  │
                                  ├─ 1. Mesh probe: token_mesh_hydrate(mint)
                                  │      → returns any prior knowledge, related wallets, sister tokens
                                  │
                                  ├─ 2. Dev wallet resolve (fast path):
                                  │      creator-wallet-resolver({tokenMint, single})
                                  │      → if found, upsert into mesh (developer_profiles + creator_profiles)
                                  │      → if dev already known: pull prior_tokens, prior_x_handles,
                                  │        ATH history, KYC root → attach to lifecycle.metadata
                                  │
                                  ├─ 3. Post bare CA into BLACKBOX group
                                  │      (existing blackbox-tick / aggregator path)
                                  │      → wait 15s for bot replies → scrape socials (X, website, TG,
                                  │        Discord), security flags, anything cheaper than API
                                  │      → fuseCreator() merges everything into mesh
                                  │
                                  ├─ 4. /holders enrichment:
                                  │      bagless-holders-report(mint)
                                  │      → true wallet count, dust vs whale %, top10 dynamic refresh
                                  │
                                  └─ 5. no-lube-orchestrate(mint, source='insiders')
                                         → first sighting → PRIVATE only, with full enriched payload
                                         → baseline = lifecycle.entry_market_cap (NOT post_log mcap)
```

On every later re-sighting (same mint seen again in Insiders OR scheduler tick):

```text
no-lube-orchestrate(mint)
  ├─ baseline = telegram_insider_token_lifecycle.entry_market_cap   ← immutable
  ├─ skip dev/mesh/blackbox steps (already done)
  ├─ refresh ONLY: current mcap, /holders breakdown, AI assessment
  ├─ ratio = current_mcap / baseline
  ├─ milestone = floor(ratio); post only when milestone > last posted milestone
  └─ post PRIVATE + PUBLIC with new X factor, fresh holder %, fresh AI take
```

## Files to change

1. **`supabase/functions/no-lube-orchestrate/index.ts`**
   - Replace the "first post_log row" baseline lookup with a read of
     `telegram_insider_token_lifecycle.entry_market_cap` for the mint.
   - Fall back to first post_log mcap only if lifecycle row is missing.
   - Keep the milestone gate; remove the dependency on `no_lube_post_log` for the baseline.
   - Pass the lifecycle metadata (ticker, age, top10, security) into compose so templates can use it without re-fetching.

2. **`supabase/functions/no-lube-ingest/index.ts`** *(new)*
   - Single entry the lifecycle builder calls per new mint.
   - Sequentially fires: `token-mesh-hydrate` → `creator-wallet-resolver` (single-target) → blackbox CA post → wait + harvest → `bagless-holders-report` → `no-lube-orchestrate`.
   - Idempotent: marks `telegram_insider_token_lifecycle.ingest_status` so a re-call no-ops.

3. **`supabase/functions/insiders-lifecycle-builder/index.ts`**
   - After upserting a new lifecycle row, `supabase.functions.invoke('no-lube-ingest', { mint })` (fire-and-forget, don't block the cron).

4. **`supabase/functions/no-lube-compose/index.ts`**
   - Read `entry_market_cap`, `ticker`, `top10`, `security`, dev dossier from
     lifecycle + creator_profiles instead of re-deriving.
   - Accept optional `baseMcap` from orchestrate so it doesn't re-query.

5. **`supabase/functions/blackbox-tick/index.ts`**
   - Already wired for aggregator scrape; expose a `triggerForMint(mint)` helper
     so `no-lube-ingest` can fire it on-demand instead of waiting for the cron.

6. **Migration** — add to `telegram_insider_token_lifecycle`:
   - `ingest_status text default 'pending'` (`pending` | `enriching` | `enriched` | `failed`)
   - `ingest_completed_at timestamptz`
   - `dev_wallet_resolved_at timestamptz`
   - `mesh_hydrated_at timestamptz`
   - `holders_refreshed_at timestamptz`

## Validation after build

- Trigger Insiders ingest manually for QUEENBIRD (`Btbk9EA2NxNj7x3FbJZSGB6RivLcoAezcwAnwKK8pump`):
  - lifecycle row has `entry_market_cap = 107000`
  - `no_lube_post_log` first row uses that as baseline
  - dev wallet is resolved within 30s
  - blackbox aggregator run exists for the mint
  - /holders report row exists
  - PRIVATE post fires once; PUBLIC stays silent until 2x of $107k = $214k
- Trigger GOSLINGS again — confirm baseline is the original Insiders entry mcap (not the 363k post-log row) and the next public post only fires at the next integer milestone above what's already been posted.

## Out of scope (will not touch)

- The existing milestone gate logic itself (working as intended).
- `no-lube-render-card` (already getting ticker + entry_mcap + current_mcap).
- Telegram bot DM formatting / obfuscation rules.

Reply **Plan Approved** to proceed.
