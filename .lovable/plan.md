
## Quick verdict per section

### 1. Reputation Backfill Engine — **Useful, but one-shot. Should be hidden, not removed.**

- **"Start Backfill"** invokes the `reputation-backfill` edge function. It walks every row in `dev_wallet_reputation` (63,432 rows) and upserts a matching row into `developer_profiles` (currently 59,712 — so it has already been run almost to completion). Pure DB-to-DB sync, no external API calls.
- **"Reset"** just zeroes the local React state (offset/processed/errors counters) so you can re-run from scratch. It does **not** wipe any DB data.
- **Status:** the engine itself is still wired and works. But this is a one-time migration tool — once `developer_profiles` is fully populated, ongoing sync happens through the live mesh writers (creator-fusion, fuseCreator, etc.), not this button.
- **Recommendation:** collapse it under a "Maintenance / one-shot tools" accordion. Don't delete — we'll need it again any time `dev_wallet_reputation` schema expands.

---

### 2. Genealogy Retracer (KYC Trail Walker) — **The panel is fine. The data behind it explains the 0%.**

Live numbers from the DB right now:

| Metric | Value |
|---|---|
| Lifecycle rows | 3,407 |
| With genealogy_chain | 3,012 (88%) |
| With kyc_status set | 3,407 (100%) |
| With kyc_label set | 2,685 (79%) |
| **With genealogy_kyc_root** | **0** |
| Attempted at least once | 3,224 |

**Why KYC root = 0%:** I sampled rows where `kyc_label` is populated. Every single one has `kyc_label = 'Exhausted'` and the deepest hop has `cexName: null`. Translation: the Helius walker reaches max depth (some chains go 22 hops deep) without ever landing on a wallet that exists in `_shared/cex-wallets.ts`. The retracer logic is correct — it scans every hop and stamps the first CEX hit as the root — there just aren't any hits to stamp.

This is **not** a bug in the button. It's a coverage gap in the CEX dictionary (`cex-wallets.ts`). Until that file grows, every "Rescan" pass will keep returning 0 new roots.

#### "Rescan KYC (free)" button
- Calls `insiders-genealogy-rescan-kyc`. **Zero RPC cost** — pure dictionary lookup against the existing chain JSON.
- **Useful?** Yes, but only after we expand `cex-wallets.ts`. As-is, it loops 20×, scans up to 20,000 rows, and finds nothing. Currently a no-op.
- **Recommendation:** keep the button, but add an inline hint: "Only finds new roots after `cex-wallets.ts` is expanded — current dictionary saturated against the chain set."

#### "Retrace Insiders KYC" button
- Calls `insiders-genealogy-backfill` which **does** spend Helius credits (re-walks every chain from scratch).
- **Useful?** Marginally. Since 88% of rows already have a chain and the chains are exhausted, re-walking won't reveal new roots without either (a) higher max depth or (b) a richer CEX dictionary. It mostly just burns Helius quota.
- **Recommendation:** demote to a hidden "Force re-walk (Helius cost)" tool behind a confirmation dialog. The 24h-cooldown `kyc-backfill-master` cron already handles new tokens incrementally; the manual button shouldn't be front-and-center.

#### "Tier A / Tier B" archive buttons
- Calls `backfill-genealogy` (separate function for tokens outside the Insiders set). Same Helius-cost concern as above.
- **Recommendation:** keep but move to a "Legacy / wide net" accordion.

---

## Plan — what to change

This is a planning summary; no code yet. On approval I'll execute in this order:

1. **Add a `KYC dictionary saturation` diagnostic line** to the panel header so the 0% number stops looking like a broken button. Show: "Chains exhausted against current CEX dictionary: 2,685 — expand `cex-wallets.ts` to unlock more roots."

2. **Reorganise the panel** into three groups:
   - **Active (free):** Rescan KYC (free) — primary CTA, with the hint above.
   - **Maintenance (one-shot):** Reputation Backfill Engine — collapsed accordion.
   - **Legacy / Helius-cost:** Retrace Insiders KYC + Tier A/B — collapsed accordion with a "burns Helius credits" warning.

3. **Wire the Reset button to also clear the panel's last-run status pills**, so it's actually useful and not just a counter reset. (Optional polish.)

4. **No DB changes, no edge function changes** in this pass. The retracer logic is correct; the fix for 0% KYC roots is a separate, larger task: expanding `cex-wallets.ts` (manual research) or adding a Helius-tag fallback (e.g. "Binance Hot Wallet" tag classification) — that should be its own conversation.

---

## TL;DR for you

- **Reputation Backfill / Start Backfill**: already 94% done, keep it but hide it.
- **Reset button**: harmless local counter reset, keep it.
- **KYC root 0%**: not a button bug — your CEX dictionary doesn't cover the wallets at the end of these chains. The walker correctly reports "Exhausted" and the panel correctly shows 0.
- **Rescan KYC (free)**: keep, but it's a no-op until `cex-wallets.ts` is expanded.
- **Retrace Insiders KYC**: still works, but burns Helius credits for almost no gain right now. Demote behind a warning.

Want me to apply the reorganisation + saturation hint now, or do you want to tackle the `cex-wallets.ts` expansion first so the buttons actually have something to chew on?
