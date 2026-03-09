

## Investigation Report & Fix Plan

### What's Actually Happening

**1. "All RPC endpoints failed" — This IS a Helius credit limit issue**

The `helius` provider is **disabled** in `api_provider_config` (`is_enabled: false`). But `bagless-holders-report` doesn't use that config table — it directly checks for `HELIUS_API_KEY` and builds its own endpoint list (line 57-59). When Helius returns 429 (rate limited), the call fails, and the only fallback is `api.mainnet-beta.solana.com` which also rate-limits on heavy `getProgramAccounts` calls.

The Helius usage logs confirm massive 429 rates: **15,943 rate-limited calls** from `scalp-mode-validator` alone in the last 24 hours. You are being hammered by your own functions burning through Helius credits, and `bagless-holders-report` gets caught in the crossfire.

**66 of 68 failures** = `"All RPC endpoints failed"` — this is Helius 429 + public Solana RPC 429.
**2 failures** = `WORKER_LIMIT` — Supabase compute limit (large token with 12k+ holders).

**2. Health Grade F skips — this is aggressive filtering**

`SKIP_GRADES = ['F']` on line 12 of `holders-intel-poster`. Any token scoring below 50/100 gets grade F and is skipped. In the last 48 hours: **205 items skipped** (almost all "Low health grade: F"). Only **6 posted successfully**.

The health score is a weighted composite of: holder count, whale concentration, dev holdings, buy/sell ratio, bundled wallets, LP presence, volume, price trend, and dust ratio. Vitality penalties (volume collapse, price crash, zero transactions) can push scores below 50 easily for small/new tokens. Many pump.fun tokens will naturally score F — that doesn't mean they shouldn't be posted. Users want to see those reports.

**3. Pending items — 35 sitting in queue**

Several are retry duplicates (e.g., MOGA, Ferrari, WW3 each have 2-3 entries). They'll keep failing because the same RPC issues persist.

---

### Fix Plan

#### Fix 1: Stop skipping F-grade tokens — post them anyway
- Remove `'F'` from `SKIP_GRADES` in `holders-intel-poster/index.ts` (line 12)
- Change to `SKIP_GRADES = []` so all tokens get posted regardless of health grade
- The health grade is already shown in the post — let users decide if they care

#### Fix 2: Add more RPC fallbacks in `bagless-holders-report`
- The function only has 2 endpoints: Helius + `api.mainnet-beta.solana.com`
- Add `https://rpc.ankr.com/solana` and `https://solana-mainnet.g.alchemy.com/v2/demo` as additional fallbacks (same ones already in `rpc-provider.ts`)
- These free RPCs may also rate-limit on `getProgramAccounts`, but having 4 endpoints vs 2 gives better odds

#### Fix 3: Reduce Helius credit burn from other functions
- `scalp-mode-validator` made **15,943 rate-limited calls** in 24 hours — this is the #1 credit burner
- `liquidity-lock-checker` made **3,232 rate-limited calls**
- These functions are exhausting Helius credits before the poster even gets a chance
- Add request throttling or reduce polling frequency on these two functions

#### Fix 4: Reset failed/pending items in the queue
- Update the 66 `failed` items and 35 `pending` items back to `pending` with cleared error messages and fresh `scheduled_at` timestamps so they get retried after the RPC fixes are deployed

### Files to Edit
- `supabase/functions/holders-intel-poster/index.ts` — remove F from SKIP_GRADES
- `supabase/functions/bagless-holders-report/index.ts` — add more RPC fallback endpoints
- Database: reset queue items via UPDATE query after deployment

