## Answers first

### 1. When would a token legitimately need a retry?
Only one case has real value: a token whose **snapshot already posted inside the freshness window** but whose **big_picture multiplier (2x+)** hasn't fired yet because enrichment (mcap, holders, mesh) was lagging at snapshot time. That's literally the only thing the milestone-sweeper is supposed to chase.

Everything else (failed compose, dead carcass, no creator, never-eligible) is **not a retry candidate** — the moment has passed and the post has no value.

### 2. Why old tokens keep getting re-touched
`no-lube-milestone-sweeper` runs on a cron and pulls **every mint posted in the last 48h** plus every mint that has a snapshot-without-big_picture (no time bound), then calls `no-lube-orchestrate` on each. The 30-min backlog gate I just added makes orchestrate cheaply exit for old rows — but the sweeper is still **selecting** them every tick. That's the source of the "going back through old shit" feeling. It's a sweeper-selection problem, not a "new rule applied to old data" problem.

### 3. Where Admin Alerts to BLACKBOX come from
`supabase/functions/_shared/api-failure-alerts.ts:93` calls `broadcastToTelegram(supabase, message, ['BLACKBOX'], 0)` for every 401/403/429 from any tracked API (Solscan, Pump.fun, Helius, etc.). That's what's flooding the BLACKBOX.FARM group.

### 4. Who's calling Solscan `/v2.0/account/detail` (the function in the alerts)
**Function:** `solscanCheckAccountLabel` in `_shared/solscan-intelligence.ts`
**Callers:**
- `mesh-kyc-deep-search/index.ts` (lines 151, 276) — checks if a funder wallet is a labelled CEX during KYC tracing
- `oracle-unified-lookup/index.ts` (line 763) — same purpose on demand

**How crucial:** Medium. It's the "is this wallet a CEX?" lookup during genealogy walks.
**Fallback:** Yes — two layers already exist:
  - Internal `cex-wallets.ts` dictionary (matched by address before any API call)
  - Helius `/v1/wallet/{addr}/funded-by` returns funder data and we already self-label known CEX addresses from the dictionary
  Solscan's label is only "extra" enrichment when the wallet isn't in our dictionary. Skipping it degrades gracefully — KYC traces still complete via Helius.

---

## Plan

### Step 1 — Stop Telegram admin alerts to BLACKBOX group
File: `supabase/functions/_shared/api-failure-alerts.ts`
- Remove the `broadcastToTelegram(..., ['BLACKBOX'], 0)` call (lines 91-97).
- Keep the `admin_notifications` DB insert so alerts still show up in the in-app Admin Alerts panel and dashboard badge.
- Same change applied to `_shared/pumpfun-fetch.ts:356` (the other TG alert site) — DB insert only, no Telegram broadcast.

Result: BLACKBOX.FARM group stops receiving "API RATE LIMITED" spam. Admin dashboard still shows everything.

### Step 2 — Tighten milestone-sweeper to only chase legitimate retries
File: `supabase/functions/no-lube-milestone-sweeper/index.ts`
- Add a hard freshness gate on the SELECT itself, not just orchestrate:
  - Join lifecycle row, exclude any mint where `first_called_at < now() - interval '30 minutes'`.
- For the "snapshot without big_picture" branch: cap at mints where `first_called_at` is within the last 30 min AND `entry_market_cap > 0`. Older rows are abandoned permanently — the snapshot was their one shot.
- For the "resighting / 2x+" branch: keep 48h window but require `last_known_mcap >= 2 * entry_market_cap` before firing (the gate that actually justifies a retry).

Result: sweeper stops selecting carcasses. Orchestrate sees only mints that have a real shot at a multiplier post.

### Step 3 — Solscan caller hardening (defer-friendly)
No code change required for the alert symptom (Step 1 already silences it). If you want to also reduce the underlying 429s:
- In `solscanCheckAccountLabel`, check `_shared/cex-wallets.ts` dictionary first and **short-circuit** before hitting Solscan when the address is already a known CEX. (Most hot wallets are.)
- On any 429, immediately return `null` (let caller fall through to Helius) instead of retrying.

I'll include this as part of Step 3 — it's small and directly cuts Solscan call volume.

### Out of scope
- No template changes.
- No DB cleanup of old pending rows (the sweeper SELECT change makes them invisible going forward).
- No change to the backlog age gate I just added — it stays as a safety net.

### Files touched
1. `supabase/functions/_shared/api-failure-alerts.ts` — remove TG broadcast
2. `supabase/functions/_shared/pumpfun-fetch.ts` — remove TG broadcast at the alert site
3. `supabase/functions/no-lube-milestone-sweeper/index.ts` — freshness + multiplier gates on selection
4. `supabase/functions/_shared/solscan-intelligence.ts` — dictionary short-circuit + fail-fast on 429
