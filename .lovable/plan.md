# Launchers Tab — Dev Mint Sniper

A new admin tab to track active token launchers (devs), spider their wallet families, detect mints in near-real-time, and execute configurable auto-buy / auto-sell using the flipit wallet. First profile: **@pumpfun711** ($FU, $UU, $PU, etc).

## 1. Resolution & seeding (@pumpfun711)

Before any UI work, resolve @pumpfun711 against existing data:
- `x_account_registry` → x_user_id, handle history, followers
- `creator_profiles` / `dev_wallet_reputation` → all linked dev wallets, KYC root, sister wallets
- `proven_dev_tokens` → every $ticker he has launched, ATH mcap, mint dates
- Rank his wallets by **most recent activity** (last mint timestamp DESC, then mint count DESC) so the top of the list is "the wallet he is currently minting from"

Output: a confirmed dossier we anchor the first Launcher Profile to.

## 2. Data model (new tables)

**`launcher_profiles`** — one row per tracked dev
- name (display label, e.g. "pumpfun711")
- x_handle, x_user_id
- primary_dev_wallet
- linked_wallets (text[]) — spidered family
- kyc_root_wallet
- spider_depth (default 3), last_spidered_at
- is_active (bool), notes
- created_by (admin user_id)

**`launcher_trade_rules`** — per-profile master settings
- launcher_profile_id (FK)
- mode: `limit_order` (matches existing Limit Order Mode pattern)
- buy_amount_sol (numeric, e.g. 0.01)
- slippage_bps (int, e.g. 1500 = 15%)
- priority_fee_lamports (gas) + jito_tip_lamports
- target_factor (numeric, e.g. 3.0 → sell at 3× entry mcap)
- max_hold_seconds (safety auto-exit)
- max_daily_spend_sol (kill switch)
- min_seconds_after_mint (e.g. 4) — wait window before snipe
- require_dev_buy_min_sol (e.g. only fire if dev himself bought ≥ X SOL)
- funding_wallet_id → **flipit wallet**
- enabled (bool)

**`launcher_mint_events`** — detection + execution log
- launcher_profile_id, mint_address, detected_at, dev_wallet_used
- dev_initial_buy_sol, initial_mcap_usd
- buy_tx_sig, buy_filled_at, buy_amount_sol, entry_mcap_usd
- sell_tx_sig, sell_filled_at, exit_mcap_usd, realized_pnl_sol
- status: detected → bought → holding → sold | skipped | failed
- skip_reason (e.g. "daily cap hit", "dev buy below threshold")

**`launcher_enrichment`** — async link/social findings post-mint
- mint_address, links_found (jsonb: x, tg, website, etc), found_at

RLS: super-admin only.

## 3. Mint detection pipeline

Reuse existing **Predictive Mint Detection** (polling, ~2–5s latency, per the Predictive Mint Detection memory):
- New cron: `launcher-mint-watcher` runs every 3s
- For each enabled `launcher_profiles`, polls Helius `getSignaturesForAddress` on each `linked_wallets` entry
- Detects pump.fun `create` instruction → extract mint address, dev's initial buy SOL, initial mcap
- Insert into `launcher_mint_events` with status `detected`
- Triggers `launcher-snipe-executor`

Wallet list is capped (top 20 most-recent-active per profile) to stay inside Helius credits budget.

## 4. Auto-buy executor

Edge function `launcher-snipe-executor`:
- Reads rule for the profile
- Wait `min_seconds_after_mint` (default 4s)
- Pre-trade guards: daily cap, dev buy threshold, enabled flag, slippage cap, flipit wallet balance
- Build pump.fun buy tx with `buy_amount_sol`, slippage, priority fee, jito tip — sign with flipit wallet keypair (server-side AES-256-GCM, per Wallet Key Protection memory)
- Record `entry_mcap_usd`, `buy_tx_sig`
- Fail-open on guard failures (warn, don't block) — per Security Guards Policy memory

## 5. Auto-sell monitor

Edge function `launcher-position-monitor` (cron every 5s while any `holding` rows exist):
- For each holding: fetch current mcap via DexScreener cache (per DexScreener Pipeline memory) or pump.fun bonding curve fallback (per Pump Fun Price Accuracy memory)
- If `current_mcap >= entry_mcap × target_factor` → execute sell, record `exit_mcap_usd`, `realized_pnl_sol`
- If `max_hold_seconds` exceeded → force exit
- Never use stale (>10s) prices, never hardcode SOL/USD (per Core memory)

## 6. Post-mint enrichment (parallel, non-blocking)

Edge function `launcher-token-enricher` fires when a mint is detected:
- Scrape token's pump.fun page + any provided links for X handle, TG, website
- Write to `launcher_enrichment` + cross-link into `token_social_links` and the dev's existing dossier (per Developer Profile Doxing memory — never throw away enrichment signals)

## 7. UI — `Launchers` tab in BlackBoxTab

New tab between Bundle Analysis and Security. Components:

### Profile list (left rail)
- All `launcher_profiles`, sorted by last detected mint
- Each shows: avatar/handle, primary wallet (truncated), enabled toggle, today's P&L
- "+ Add Launcher" button → modal accepting **X handle OR dev wallet OR token mint** → spider job populates linked_wallets, kyc_root, dossier

### Profile detail (main pane)
Three sub-sections:

**(a) Identity & Wallets** — dossier view: handle history, X followers, KYC root, all linked wallets ranked by recent activity (most recent mint timestamp first). Schematic view (xyflow + dagre, matching existing bubble-map Schematic mode) of the wallet family.

**(b) Trade Rules** — form matching the screenshot style:
- Buy Amount (SOL) input (default 0.01)
- Slippage % input
- Priority Fee (lamports)
- Jito Tip (lamports)
- Target Factor input (default 2.0 — sells at 2× per user)
- Min seconds after mint (default 4)
- Min dev buy (SOL) to qualify
- Max daily spend (SOL)
- Max hold (seconds)
- Funding wallet: **flipit** (fixed for v1)
- Enabled toggle + "DISABLE ALL" kill switch (matches Intelligence Feature Flags pattern)

**(c) Mint Timeline** — real-time table of `launcher_mint_events`: detected_at, mint, ticker, dev buy SOL, entry mcap, status badge, current mcap, multiple (×), exit mcap, P&L. Realtime via supabase channel. Click row → token dossier + bubble map.

### Seed data
First profile auto-created for @pumpfun711 using step-1 resolution.

## 8. Safety & guardrails

- Fail-open on all pre-trade guards (warn, never block) per memory
- Every DB write uses `assertDbWrite` per Zero Tolerance Silent Fails memory
- Flipit private key never leaves server, AES-256-GCM only
- Kill switch in DB so admin can stop all sniping globally without redeploy
- Per-profile `max_daily_spend_sol` enforced before each buy

## Technical notes

```text
detect (3s poll) ──► launcher_mint_events.detected
                       │
                       ├─► wait min_seconds_after_mint
                       ├─► guards (daily cap, dev buy, balance)
                       ├─► flipit buy → status=holding
                       │
                       └─► launcher-token-enricher (parallel, non-blocking)

position-monitor (5s) ──► mcap >= entry × target_factor
                            └─► flipit sell → status=sold, P&L recorded
```

Files to add:
- migration: 4 new tables + RLS (super-admin only)
- `supabase/functions/launcher-mint-watcher/index.ts` (cron)
- `supabase/functions/launcher-snipe-executor/index.ts`
- `supabase/functions/launcher-position-monitor/index.ts` (cron)
- `supabase/functions/launcher-token-enricher/index.ts`
- `supabase/functions/launcher-profile-spider/index.ts` (used by "+ Add Launcher")
- `src/components/admin/launchers/LaunchersTab.tsx`
- `src/components/admin/launchers/LauncherProfileList.tsx`
- `src/components/admin/launchers/LauncherProfileDetail.tsx`
- `src/components/admin/launchers/LauncherTradeRulesForm.tsx`
- `src/components/admin/launchers/LauncherMintTimeline.tsx`
- `src/components/admin/launchers/AddLauncherDialog.tsx`
- `src/hooks/useLauncherProfiles.ts`
- Wire new tab into `BlackBoxTab.tsx`
- Save memory: `mem://features/launchers/dev-mint-sniper`