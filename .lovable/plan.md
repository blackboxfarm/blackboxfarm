# Alpha Dev Auto-Detect + Paper Buy + SMS

Turn the Insiders Recaps KYC/Dev groupings into a live alpha-detection engine. Every new token discovered in the Insiders channel gets checked against known-good dev wallets and KYC roots. Matches trigger a paper buy and an instant SMS to +1-226-583-5975.

## Flow

```text
Insiders TG channel
   → insiders-row-ingest (already runs)
        → NEW: alpha-dev-detector (hook)
             ├─ resolve dev wallet (Pump.fun / Helius / cache)
             ├─ resolve KYC root (developer_profiles / dev_wallet_reputation / known_cex_wallets)
             ├─ match against:
             │     (a) alpha_dev_wallets     ← direct dev wallet hit
             │     (b) alpha_kyc_groups      ← same KYC funding root
             └─ if match + quality gate passes:
                   → insert paper buy row (fantasy_positions / new alpha_paper_trades)
                   → SMS via _shared/sms-notify.ts
        → existing blackbox-tick / no-lube pipeline continues untouched
```

## 1. Data model (one migration)

Two new tables that materialize the "known alpha" set from the Insiders Recaps analysis:

- `alpha_dev_wallets` — every dev wallet that has ever minted an insiders-recap token, with best multiplier, best ticker, token count, last seen.
- `alpha_kyc_groups` — every KYC root (or CEX label) with aggregated stats: distinct devs, total tokens, best multiplier, best ticker, last seen.
- `alpha_paper_trades` — paper buy log: mint, ticker, entry mcap, size_usd (100), matched_dev / matched_kyc, sms_status, created_at.

All three get proper GRANTs (authenticated read, service_role all) and RLS.

A one-time backfill populates the first two from current `/insiders-recaps` results (the dev groupings + KYC groupings you already see on screen).

## 2. Quality gate (what counts as "alpha")

A dev wallet or KYC group qualifies for auto paper-buy only if it meets **any** of:

- Best token multiplier ≥ 10x, OR
- ≥ 2 tokens in the insiders recaps top-N with avg multiplier ≥ 3x, OR
- KYC group has ≥ 3 distinct devs that all produced ≥ 2x tokens.

Thresholds live in a small `alpha_config` row so you can tune without a redeploy.

## 3. New edge function: `alpha-dev-detector`

Input: `{ mint, source: 'insiders' }`.
Steps:
1. Resolve dev wallet (reuse `creator-wallet-resolver` + local cache tables).
2. Resolve KYC root (reuse `developer_profiles` / `dev_wallet_reputation` / `known_cex_wallets`).
3. Check `alpha_dev_wallets` (direct hit) then `alpha_kyc_groups` (funding-source hit).
4. If quality gate passes:
   - Fetch entry market cap from DexScreener/Pump.fun (live, per Live Data Mandate).
   - Insert `alpha_paper_trades` row with size_usd = 100, hold strategy.
   - Call `_shared/sms-notify.ts` with a message like:

```text
🚨 ALPHA DEV DETECTED
Ticker: $TICKER
Entry MC: $XXk
Match: dev 3fKF…9xy2  (KYC: Binance)
Dev best: 47x on $PEDRO
Group: 6 tokens, avg 8.2x
Paper buy: $100 → HOLD
```

5. Return `{ matched: bool, reason, paper_trade_id }` to the caller.

## 4. Hook into the ingest pipeline

In `supabase/functions/insiders-row-ingest/index.ts`, right after the existing Helix webhook POST and before/parallel to `blackbox-tick`:

```ts
supabase.functions.invoke('alpha-dev-detector', {
  body: { mint, source: 'insiders' },
}).catch(e => console.warn('[alpha] detector failed', e?.message));
```

Fire-and-forget so it never blocks the no-lube / blackbox flow.

## 5. UI additions on `/insiders-recaps`

- New "Alpha Watch" tab: live view of `alpha_paper_trades` (mint, ticker, entry mcap, current mcap from live source, X-so-far, SMS status, matched dev/KYC link).
- Add a small "Alpha" badge on the Dev Groupings and KYC Groupings rows that pass the quality gate.
- Manual "Rebuild alpha lists from recaps" button (admin) — rebuilds `alpha_dev_wallets` / `alpha_kyc_groups` from current recap analysis.

## 6. SMS

Uses the existing `_shared/sms-notify.ts` (Twilio via connector gateway, +1-226-583-5975). Message capped at 1600 chars, logged to `alpha_paper_trades.sms_status`. Respects `SMS_GLOBAL_KILL` env var already in place.

## 7. Out of scope (on purpose)

- Real (non-paper) buys. This is paper only. Wiring to real trading is a separate approval.
- Sell logic. "Hold" for now; can add trailing rules once we see a few real detections.

## Technical notes

- Live entry MC pulled at detection time from DexScreener → Pump.fun bonding curve fallback (never DB).
- Detector is idempotent per `(mint)` — unique index on `alpha_paper_trades.mint` prevents double-buys if ingest retries.
- All new tables include `service_role` GRANTs in the same migration, per project rules.
- No new cron. Detection is event-driven off insiders ingest. Optional 5-min sweep can be added later if we want to catch tokens that missed the ingest hook.

Approve and I'll build it in this order: migration → detector function → ingest hook → UI tab → backfill run.
