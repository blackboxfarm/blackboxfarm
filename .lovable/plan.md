# Dev Profile Card Modal — Allstar Mint Alerts

## Why
On `/super-admin?tab=allstars&sub=alerts`, you can see a dev tagged T6 (e.g. `HqBs3R…YgAR` who minted `$BabyEllen`) but nothing tells you *who* he is or *which token* earned him that tier. Answer for this specific row: he earned T6 from `$PIXEL` (mint `H43xqMLi…pump`, ATH $1.16M). That data already exists in `allstar_dev_registry` + `proven_dev_tokens` + `dev_wallet_reputation` + `launchpad_creator_profiles` + `x_account_registry` — we just don't surface it.

## What to build
A click-to-open "Dev Card" modal (baseball/Pokémon card vibe) launched from any creator wallet or T-tier badge in `AllstarMintAlerts.tsx`. Reused later anywhere we render a dev wallet.

### Card sections (top → bottom)
1. **Header / identity**
   - Display name + X handle (`x_account_registry.display_name`, `current_handle`, `followers_count`)
   - Avatar (X profile pic if cached, else generated identicon)
   - Tier badge (T1–T8) with explainer tooltip
   - Trust level chip from `dev_wallet_reputation.trust_level` (trusted / neutral / suspicious / scammer)
2. **Wallet identity block**
   - Master dev wallet → Solscan link (un-truncated, copy button)
   - KYC root wallet (if any) → Solscan link
   - Family size + expandable list of `family_wallets` / `linked_wallets`
   - Known aliases (`dev_wallet_reputation.known_aliases`)
3. **Top 5 Best Tokens** (the headline section you asked for)
   - Query `proven_dev_tokens` for this `wallet_address`, order by `peak_mcap_usd DESC LIMIT 5`
   - Each row: ticker • name • ATH mcap • ATH date • launchpad • Solscan + Pump.fun link
   - Highlight the `best_token_mint` from `allstar_dev_registry` as the tier-defining token
4. **Career stats**
   - Total tokens launched / graduated / rugged / abandoned
   - Success rate %, avg peak mcap, avg lifespan, typical sell %
   - Behavioral pattern badges (`pattern_spike_kill`, `pattern_diamond_dev`, `pattern_buyback_dev`, `is_serial_spammer`, etc.)
5. **Social & community footprint**
   - X handles (array from `dev_wallet_reputation.twitter_accounts`) with follower counts
   - Telegram groups / Discord servers managed (`telegram_groups`, `discord_servers`)
   - Launchpad creator profiles (`launchpad_creator_profiles` rows for this wallet — Pump.fun, LetsBonk, Believe, etc.) with profile URL
6. **KOLscan cross-reference** (new, lightweight)
   - If the dev wallet OR a sister wallet appears on kolscan.io, show the KOL handle + link
   - Implementation: try `https://kolscan.io/account/<wallet>` HEAD/GET via the existing Smart Scrape router; cache result in a new column `kolscan_handle` on `dev_wallet_reputation` (24h TTL)
7. **Verdict line**
   - One-sentence AI-ish summary: "Legit builder — 1 proven token ($PIXEL, $1.16M ATH), no rug history" or "Serial spammer — 47 mints, 41 rugs, avoid"
   - Derived deterministically from the stats above (no AI call needed)

## Data flow
- New edge function `dev-profile-card` (GET `?wallet=…`) that joins:
  `allstar_dev_registry` ⨝ `dev_wallet_reputation` ⨝ `dev_reputation_v2` ⨝ `proven_dev_tokens` (top 5) ⨝ `launchpad_creator_profiles` ⨝ `x_account_registry`
- Returns one JSON dossier. Cached in-memory 5 min per wallet.
- Frontend hook `useDevProfileCard(wallet)` (react-query, 5 min stale).
- Per the **Developer Profile Doxing** memory: any new signal fetched here (kolscan handle, fresh X followers) is written back via `fuseCreator()` so the dossier keeps growing.

## UI / file changes
- `src/components/dev-profile/DevProfileCard.tsx` — the modal card (shadcn `Dialog`, gold/black aesthetic per branding memory, holographic gradient border for T6+).
- `src/components/dev-profile/DevProfileCardTrigger.tsx` — small wrapper: wraps a wallet string and opens the modal on click.
- `src/hooks/useDevProfileCard.ts`.
- `supabase/functions/dev-profile-card/index.ts`.
- `src/components/admin/allstar/AllstarMintAlerts.tsx` — wrap creator wallet + T-tier badge cells in `DevProfileCardTrigger`.
- Migration: add `kolscan_handle text`, `kolscan_checked_at timestamptz` to `dev_wallet_reputation`.

## Out of scope
- No changes to alert ingestion, scoring, or broadcasting.
- No changes to the table layout beyond making two cells clickable.
- KOLscan scrape is best-effort fail-open (per security guards policy).

## For this specific row (immediate sanity check)
Card for `HqBs3RVM…YgAR` will show: T6 • best token `$PIXEL` (ATH $1.16M, mint `H43xqMLi…pump`) • family size 1 • no KYC root yet • no X handle yet → which makes it obvious why he was promoted and gives you a one-click path to investigate further.
