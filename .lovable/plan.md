## Master Token Directory — Revised Plan

### 1. UI fixes — `src/components/admin/tabs/MasterDBTab.tsx`

- **Symbol** → link `https://dexscreener.com/solana/{mint}`
- **Mint** → link `https://solscan.io/token/{mint}` (keep copy button)
- **Launchpad** → link `https://pump.fun/{mint}` / `https://bonk.fun/{mint}` / `https://bags.fm/{mint}`
- **Img** → keep, fall back chain already in view; show 24×24, click → `TokenImageModal`
- **X Communities** → render community name + link only (drop admin/mod handles from this cell)
- **X Handles** → unified list of `mesh_x_handles ∪ community_admin_handles ∪ community_mod_handles ∪ launchpad_creator_handle`, deduped, role-badged (👑 admin / 🛡️ mod / 🧑‍🚀 creator), each links to `https://x.com/{handle}`
- **ATH (all-time)** → source `pumpfun_watchlist.ath_market_cap_usd`; tooltip shows `ath_market_cap_at`. Falls back to `token_lifecycle.ath_24h_usd` only when no all-time figure exists, with `(24h)` tag.
- **Grad / Graduated At** → mark graduated when ATH market cap ≥ $69k OR Raydium pool present, regardless of `pumpfun_watchlist.is_graduated`. Show full date+time.
- **Websites display-only filter** → hide rows whose host is in a known-non-token blocklist (`axiom.trade, photon-sol.tinyastro.io, gmgn.ai, bullx.io, jup.ag, birdeye.so, dexscreener.com, pump.fun, raydium.io, solscan.io, t.me, x.com, twitter.com`). **No DB rows are deleted.** Bad rows stay in `reputation_mesh`, simply not surfaced.
- **Backfill ATH button** → removed (drop button + mutation).

### 2. Websites — event-driven dual-source, no polling

- New table `token_website_sources(token_mint, url, host, source 'launchpad'|'dexscreener_paid', first_seen_at)` with unique `(token_mint, url, source)`. Append-only — never overwritten.
- **Launchpad capture (one-shot per token):** in `enrich-scraped-tokens` and `pumpfun-monitor` insert ingestion paths, when launchpad metadata is first read, write any `website` field to `token_website_sources` with `source='launchpad'` if not already present. No re-checks.
- **DexScreener-Paid capture (one-shot per token):** existing `dex-paid` detection path (already triggered when a token's `dexscreener.dexPaid` first flips true) writes `info.websites[]` with `source='dexscreener_paid'`. No periodic refresh of healthy tokens.
- Materialized view `master_token_directory` reads from `token_website_sources` (joined alongside the existing mesh websites). Each website row exposes `{url, sources[]}`; UI shows badges 🚀 launchpad / 📊 dex-paid and a ⚠️ when both sources exist with different URLs (the "they changed" signal you described).
- Existing `reputation_mesh` website rows untouched.

### 3. KYC backfill — newest → oldest, runs forever

- New edge function `kyc-backfill-master`, cron `*/10 * * * *`:
  - Selects 50 rows from `master_token_directory` where `kyc_verified=false AND creator_wallet IS NOT NULL`, `ORDER BY created_at DESC`, skipping wallets touched in last 24h (uses new `developer_profiles.kyc_last_checked_at`).
  - Calls Solscan Pro v2 `/account/transfers` + `/account/detail` via `solscanFetch`, applies existing CEX-mapping logic from `cex-wallets.ts`.
  - Writes `developer_profiles.kyc_verified`, `.kyc_source`, `.kyc_last_checked_at`. Never deletes.
- Reuses `mesh-kyc-deep-search` helpers; this function is the directory-driver.

### 4. X Handles + creator backfill (piggybacks on §2)

- Same launchpad-first-read and dex-paid-first-flip events also write the launchpad/dex creator twitter into `reputation_mesh(token, twitter)` with `discovered_via='launchpad_first_seen'` / `'dexscreener_paid_first_flip'`. Powers the new unified X Handles cell.

### 5. View migration

Single migration adds:
- `token_website_sources` table + unique index
- `developer_profiles.kyc_last_checked_at`
- View additions: `ath_market_cap_usd`, `ath_market_cap_at`, augmented `is_graduated` rule, `website_sources jsonb`, `x_handles_unified text[]`
- Cron schedule for `kyc-backfill-master`

### Files

- `src/components/admin/tabs/MasterDBTab.tsx`
- `supabase/functions/_shared/non-token-domains.ts` (display blocklist constant, also imported by UI via a tiny duplicate const in `src/lib/`)
- `supabase/functions/kyc-backfill-master/index.ts`
- `supabase/functions/enrich-scraped-tokens/index.ts` (add launchpad website event-write)
- `supabase/functions/pumpfun-monitor` ingestion path (add launchpad website event-write)
- `supabase/functions/<dex-paid detector>` (add dex-paid website event-write — locate existing one)
- `supabase/migrations/<ts>_master_directory_v2.sql`

### Out of scope
- Bulk re-scraping or deleting existing `reputation_mesh` website rows
- Periodic website re-checks on healthy tokens
- Rep / Trust / Pattern population