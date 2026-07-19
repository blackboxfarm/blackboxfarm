## Goal
Add a third tab **"KYC Groupings"** to `/insiders-recaps` — same shape as Dev Groupings, but keyed by the KYC root wallet (the exchange/CEX or terminus wallet the dev's funding chain traces back to). Applied across all resolved tokens (~312).

## Data sources (already in DB, no new tables)
For each dev wallet already resolved on the page, look up:
1. `developer_profiles` → `kyc_root_wallet`, `kyc_root_label`, `kyc_source_type`, `kyc_trail_status` (keyed by `master_wallet_address`)
2. Fallback: `dev_wallet_reputation` → `trail_end_kyc_root`, `trail_end_reason` (keyed by `wallet_address`)
3. Label enrichment: `known_cex_wallets` → `cex_name`, `cex_label`, `entity_type` for any KYC root not already labeled

No Helius / on-chain tracing is triggered from this tab — it only surfaces KYC that's already been resolved by the existing genealogy pipeline. Devs with no KYC trail show under a **"Unresolved KYC"** group with a per-row status (e.g. `no_trail`, `dead_end`, `pending`).

## UI
- New tab button: `Tokens | Dev Groupings | KYC Groupings`
- Each KYC card:
  - Header: CEX/label badge (e.g. "Binance Hot Wallet"), KYC root wallet (copy + solscan), token count, best X, distinct dev count
  - Table of every token that rolls up to this KYC: `$Ticker | Dev (short + scan) | Best X | Entry MC | Peak MC | Recap | Date | Pump/Dex/Holders`
- Same search box (matches ticker, CA, dev, KYC label, KYC wallet)
- Toggle: **"Repeat KYC only"** (default ON) — groups with 2+ tokens
- Progress indicator: `kyc: N/312 resolved`

## Implementation
1. New client effect in `src/pages/InsidersRecaps.tsx` that runs after `devs` populates:
   - Collect unique dev wallets
   - Batch-select from `developer_profiles` where `master_wallet_address IN (...)`
   - For misses, batch-select from `dev_wallet_reputation`
   - Batch-select `known_cex_wallets` for any KYC roots missing a label
   - Store as `kyc: Record<devWallet, { root, label, source, status } | null>`
2. New `useMemo` `kycGroups` — mirrors the existing `devGroups` structure but keys by `root`
3. New tab render block — reuses the badge/table styling from Dev Groupings

## Out of scope
- Triggering fresh Helius traces (would blow the credit budget); tab shows only what's already known. If the user wants a "Resolve missing KYC" button that fires `wallet-genealogy-scanner`/`mesh-kyc-deep-search` for unresolved devs, that's a follow-up.
- No DB migrations, no new edge functions.
