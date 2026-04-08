

## Credit Audit + Depth/Sibling Optimization

### Findings: Where Your Helius Credits Go

Here's the actual breakdown from your `helius_api_usage` table (all-time total: **602,495 credits logged**):

```text
APRIL 2026 (so far — 8 days):
  token-creator-linker      109,180 credits  (36%)  ← #1 THIS MONTH
  wallet-genealogy-scanner  104,015 credits  (34%)  ← #2
  oracle-unified-lookup      68,574 credits  (23%)
  pumpfun-token-enricher     10,260 credits  (3%)
  everything else             ~7,000 credits  (2%)
  TOTAL APRIL:             ~300,000 credits

MARCH 2026:
  wallet-genealogy-scanner  198,055 credits  (65%)  ← DOMINANT
  oracle-unified-lookup      42,219 credits  (14%)
  pumpfun-token-enricher     33,275 credits  (11%)
  everything else            ~28,000 credits  (9%)
  TOTAL MARCH:             ~302,000 credits
```

### The Three Credit Monsters

**1. `wallet-genealogy-scanner` — 302K credits total (biggest all-time)**
- Fetches `/v0/addresses/{wallet}/transactions` (5 credits each via interceptor)
- Traces TOP 3 incoming transfers per wallet recursively (branching tree)
- At depth 8 with 3 branches: worst case 3^8 = 6,561 API calls per wallet
- Called by `backfill-genealogy` (batch cron), `oracle-master-spider`, and on-demand
- **This is your #1 target for optimization**

**2. `token-creator-linker` — 109K credits this month (new spike)**
- Makes basic RPC calls (1 credit each) but at massive volume: 109K calls in 8 days
- Likely a cron or batch process linking token creators
- Running ~13,600 calls/day

**3. `oracle-unified-lookup` — 111K credits total**
- Mix of `getAddressTransactions` (5 credits) and RPC/GET calls (1 credit)
- Used for on-demand holder analysis queries

### Your Requests: 20-hop max, no siblings past 5

Currently:
- `funding-resolver.ts`: `maxDepth = 6` (default)
- `mesh-kyc-deep-search`: siblings discovered at `depth <= 2`
- `wallet-genealogy-scanner`: `maxDepth = 8` (default), traces **top 3 branches** per hop

The genealogy scanner is the expensive one because it branches 3-wide. At depth 8 with 3 branches, that's exponential. Going to depth 20 with 3 branches would be catastrophic (3^20 = 3.4 billion theoretical calls).

**The fix**: For KYC tracing, follow only the LARGEST transfer (1 branch) to depth 20. Siblings stay useful at depth ≤ 5 but only for `mesh-kyc-deep-search`, not the genealogy scanner.

### Changes

| File | Change |
|------|--------|
| `supabase/functions/_shared/funding-resolver.ts` | Change default `maxDepth` from 6 → 20 |
| `supabase/functions/mesh-kyc-deep-search/index.ts` | Change sibling discovery gate from `depth <= 2` → `depth <= 5`; keep existing logic otherwise |
| `supabase/functions/wallet-genealogy-scanner/index.ts` | Change default depth from 8 → 20; reduce branch width from top-3 → top-1 (largest transfer only) for the primary KYC trace path. Optionally trace 2nd-largest only at depth ≤ 3 for near-root diversity |
| `supabase/functions/backfill-genealogy/index.ts` | Update invocation depth from 5 → 20 |
| `supabase/functions/oracle-master-spider/index.ts` | Update invocation depth from 3 → 10 (spider doesn't need full 20) |

### Credit Impact Estimate

**Before** (depth 8, 3 branches): Up to 3^8 = 6,561 calls per wallet trace
**After** (depth 20, 1 branch): Exactly 20 calls per wallet trace (linear, not exponential)

That's a **~300x reduction** in worst-case API calls per trace. Monthly genealogy credits should drop from ~200K to under 20K.

### Note on "10 million credits"

Your logged data shows ~600K total all-time across both tables. The 10M+ figure you're seeing likely comes from your Helius dashboard which counts raw RPC credits differently (e.g., `getProgramAccounts` = 100 credits in Helius billing vs. 1 in our logger). The `token-creator-linker` at 109K logged calls could be 10M+ in Helius billing if each RPC call costs 100 Helius credits.

