## Why the list is only 216

`allstar-promotion-engine` (the cron that fills the registry) qualifies devs **only by `token_lifecycle.market_cap`** — i.e. the token's *current* mcap, right now. Anything that pumped past $100k and then died is invisible to it. It also caps each run at **15 promotions** and never reads our richer history tables.

What we actually have in the DB:

| Source | Tokens ≥ $100k | Distinct devs |
|---|---|---|
| `token_lifecycle.market_cap` (what the engine uses today) | 149 | ~149 |
| `token_lifecycle` ANY ath/fdv/mcap signal ≥ $100k | **677** | ~567 |
| `proven_dev_tokens.market_cap_ath` ≥ $100k | **732** | **610** |
| Currently in `allstar_dev_registry` | 216 | 216 |

So we're missing ~400 qualified devs. `ath_alltime_usd` is also empty (backfill never finished), which makes the gap worse.

## End-state we're building toward

```text
   Funnel (token_lifecycle, proven_dev_tokens, autopsy, holders-intel)
            │
            ▼
  [ allstar-backfill-historical ]   ← one-shot sweep of all $100k+ history
            │
            ▼
  allstar_dev_registry  (devs grouped, deduped, KYC-rooted, family-expanded)
            │
            ▼
  wallet_family_poll_queue          ← every dev wallet + family wallet
            │
            ▼
  [ family-mint-monitor cron, every N min ]
            │   detects new InitializeMint by any tracked wallet
            ▼
  allstar_mint_alerts  →  Telegram  +  SMS to admin
```

## The plan

### 1. Fix the qualification logic (engine rewrite)

Rewrite `allstar-promotion-engine` so it qualifies on the **best signal we have**, not just live mcap:

```text
qualifying_mcap = GREATEST(
   ath_alltime_usd, first_24h_ath_usd, ath_24h_usd, market_cap, fdv
) ≥ $100,000
```

- Also pull from `proven_dev_tokens.market_cap_ath` (732 rows ready to import).
- Remove the 15/run cap; replace with a paginated sweep (process up to 500 new candidates/run).
- Keep the rug-pull skip-guard.

### 2. One-shot historical backfill

New edge function `allstar-backfill-historical`:
- Pulls every dev with any token ≥ $100k from `proven_dev_tokens` + `token_lifecycle` (any signal).
- For tokens missing `creator_wallet`, resolves via Helius/Pump.fun (existing `creator-resolver`).
- Expands each dev into its family using `reputation_mesh` + `developer_wallets`.
- Resolves KYC root via existing `kyc-fast-path`.
- Bulk inserts into `allstar_dev_registry` (idempotent on `master_wallet`).
- Seeds `wallet_families` + `wallet_family_members` + `wallet_family_poll_queue` for every wallet.
- Triggered by a SuperAdmin button in the Allstar tab ("Rebuild from Full History").

Expected outcome: registry jumps from **216 → ~600+** real qualified devs.

### 3. Continuous funnel from the rest of the pipeline

Make sure `allstar-promotion-engine` is fed automatically from:
- new entries in `proven_dev_tokens` (already inserted by the lifecycle scoring path),
- `holders_intel_seen_tokens` graduations (Holders Intel funnel),
- `token_autopsy` survivors (anything that hit ≥$100k before dying).

Run it every 30 min as today, but with the new qualification + paginated batching.

### 4. Mint monitoring + SMS alert

`family-mint-monitor` already exists and watches `wallet_family_poll_queue` — we extend it:
- Make sure every allstar dev wallet AND every family wallet is in the poll queue (the backfill in step 2 does this).
- On new `InitializeMint` detection it already writes to `allstar_mint_alerts`.
- Add an SMS hop: when a new alert lands, call `security-sms-alert` (existing Twilio function) to text the admin phone on file. Throttled to max 1 SMS per dev per 6 h to avoid spam.
- TG alert continues in parallel (existing path).

Polling cadence:
- **P1** (Tier 4-6 devs, KYC-rooted): every 5 min.
- **P2** (Tier 2-3): every 15 min.
- **P3** (Tier 1, family siblings): every hour.

### 5. UI cleanup in `AllstarTab`

- "Backfill from Top 200" button → renamed and rewired to call `allstar-backfill-historical`.
- New stat header: *Qualified devs from history: X · In registry: Y · Coverage: Z%*.
- "New Mints" column wired to live count from `allstar_mint_alerts` (last 24 h).
- "SMS alerts: ON/OFF" toggle for the admin.

## Technical notes (for me)

- Files touched: `supabase/functions/allstar-promotion-engine/index.ts` (rewrite), new `supabase/functions/allstar-backfill-historical/index.ts`, `supabase/functions/family-mint-monitor/index.ts` (add SMS hop + dedupe window), `src/components/admin/allstar/AllstarRegistry.tsx` (button + stats), `src/components/admin/tabs/AllstarTab.tsx` (header).
- New table: `allstar_sms_throttle (master_wallet, last_sent_at)` to enforce 6h dedupe.
- Secrets needed (verify present): `TWILIO_*`, admin phone in `app_secrets` or env.
- No destructive migrations — additive only.

---

**Reply "Plan Approved" to proceed.** First action will be the historical backfill (step 2) so you can immediately see the registry jump from 216 → 600+, then I wire the SMS hop.