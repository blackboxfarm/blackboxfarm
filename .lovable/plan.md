## What you're seeing now

**DM message today:**
```
🚀 ALLSTAR MINT: $ UNKNOWN
T8 dev @cb_doge
Best: $ 7 → $3.1M
⏰ Minted: 32m ago
```

**The "Critical" column with the ⚠️ triangle** is the alert level. It is derived from the dev's tier (T-rating), nothing else:
- T6+ → `critical`
- T4–5 → `high`
- T2–3 → `medium`

So T8 dev = critical. The badge label is unclear and has no tooltip — users have to guess what "critical" means.

## What to change

### 1. Enrich the DrRick DM (and BlackBox group post) with real dev context

Pull live data when an alert fires and produce a message like:

```
🚀 ALLSTAR MINT — $ NEWTICK

👤 cb_doge (Display Name) — 1.8M followers
🏆 Best prior launch: $ 7 → $3.1M ATH (Mar 12, 2026)

🆕 New mint: $ NEWTICK (Token Name)
⏰ Minted: 32m ago  •  Launchpad: pump.fun

Pump:        https://pump.fun/<mint>
DexScreener: https://dexscreener.com/solana/<mint>
Solscan:     https://solscan.io/token/<mint>
```

Data sources:
- **Display name + followers** → `twitter-profile-enricher`-style Apify lookup (one call per alert, rare event). Cache result on `x_account_registry` so repeat alerts for the same dev don't burn Apify credits.
- **Best token ATH + date** → `proven_dev_tokens` joined by `allstar.best_token_mint` → `market_cap_ath` + `ath_timestamp` (fallback to `mint_timestamp`).

### 2. Make the alert level column self-explanatory in the UI

In `AllstarMintAlerts.tsx`:
- Wrap the `alert_level` badge in a `<Tooltip>` that says: *"Critical = T6+ dev (proven launches ≥ $1M). High = T4–5. Medium = T2–3. Higher tier = bigger track record."*
- Add the dev's `@handle` + cached follower count under the existing dev column so the table itself shows the same context as the DM.

### 3. Schema (tiny additive migration)

Add to `x_account_registry`:
- `followers_count BIGINT`
- `followers_fetched_at TIMESTAMPTZ`

Used only as a cache. No RLS changes (table is admin-read).

### Files touched

- `supabase/migrations/<new>.sql` — add 2 cache columns
- `supabase/functions/_shared/x-profile-lookup.ts` *(new)* — cached Apify-backed `getXProfile(handle)` returning `{displayName, followers}`
- `supabase/functions/allstar-mint-auditor/index.ts` — call `getXProfile` + read `proven_dev_tokens` for best-token date, rewrite `dmMessage` and `tgMessage`
- `supabase/functions/family-mint-monitor/index.ts` — same enrichment for the family-mint path
- `src/components/admin/allstar/AllstarMintAlerts.tsx` — tooltip on the alert-level badge + show dev handle/followers in row

Reply **Plan Approved** and I'll ship it.