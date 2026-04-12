

# System Audit: Bottlenecks, Redundancies, Fake Data, and Stale Data

## CATEGORY 1: FAKE / IMAGINARY DATA (Critical)

### 1A. `coin-scanner` is a random number generator disguised as a function
**File**: `supabase/functions/coin-scanner/index.ts`

This function generates **42 instances of `Math.random()`** to fabricate data when real API data is missing:
- `marketCap: Math.floor(Math.random() * 50000000) + 1000000` — random market cap up to $50M
- `holderCount: Math.floor(Math.random() * 10000) + 1000` — completely fabricated holder counts
- `liquidityLocked: Math.random() > 0.3` — coin flip for "is liquidity locked"
- `totalScore: Math.random() * 40 + 60` — random score guaranteed to pass the `minScore` filter
- `correlationScore: Math.random() * 100` — pure noise
- `newsScore: Math.random() * 100` — pure noise
- `volumeProfile: Array.from({length: 24}, () => Math.random())` — fake 24h volume curve
- `age: ['1h', '2h', '6h', '12h', '1d', '2d'][Math.floor(Math.random() * 6)]` — random age
- Fallback price: `Math.random() * 0.004 + 0.0001`

If any downstream system consumes this data, it is making decisions on random noise. **This is the worst offender in the entire codebase.**

**Fix**: Remove all `Math.random()` fallbacks. If real data is missing, return `null` and let downstream systems handle the gap. Or skip the token entirely.

### 1B. `enhanced-revenue-collector` uses hardcoded SOL price
**File**: `supabase/functions/enhanced-revenue-collector/index.ts` line 62

```typescript
const solPriceUSD = 200; // You should fetch this from an API like CoinGecko
```

This is literally a TODO someone left. SOL is ~$130 right now. Every revenue calculation from this function is wrong by ~35-50%.

**Fix**: Replace with the existing shared `getSolPrice()` from `_shared/sol-price-fetcher.ts`.

### 1C. `pumpfun-token-fetcher` fabricates liquidity
**File**: `supabase/functions/pumpfun-token-fetcher/index.ts` line 91

```typescript
liquidity: { usd: coin.usd_market_cap * 0.1 }, // Estimate
```

Liquidity is estimated as 10% of market cap. This is made-up and gets stored in `pumpfun_watchlist.liquidity_usd` as if it were real. Downstream monitoring decisions use this value.

**Fix**: Set `liquidity_usd: null` when liquidity isn't available from the API. Don't invent it.

---

## CATEGORY 2: REDUNDANCIES (Code Duplication)

### 2A. `checkMayhemMode()` is copy-pasted into 4 functions
Identical implementations exist in:
- `pumpfun-token-fetcher/index.ts`
- `pumpfun-watchlist-monitor/index.ts`
- `pumpfun-new-token-monitor/index.ts`
- `pumpfun-websocket-listener/index.ts`

Each one makes its own pump.fun API call. Should be a shared utility in `_shared/`.

**Fix**: Create `_shared/mayhem-check.ts` and import it everywhere.

### 2B. SOL price fetching is implemented 8+ different ways
There is a proper shared utility (`_shared/sol-price-fetcher.ts`) but many functions ignore it:
- `pumpfun-token-fetcher` — reads from `sol_price_cache` table, falls back to hardcoded `200`
- `pumpfun-watchlist-monitor` — same pattern, hardcoded `200` fallback
- `pumpfun-rejected-reviewer` — same, hardcoded `200`
- `pumpfun-new-token-monitor` — same, hardcoded `200`
- `pumpfun-vip-monitor` — same, hardcoded `200`
- `pumpfun-sell-monitor` — fetches from Jupiter directly, falls back to `200`
- `pumpfun-fantasy-sell-monitor` — same as sell-monitor
- `enhanced-revenue-collector` — hardcoded `200`, no fetch at all
- `flipit-unified-monitor` — its own Jupiter fetch
- `trade-guard.ts` — its own Jupiter+CoinGecko implementation
- `historical-price.ts` — its own `fetchSolPriceSimple()`

5+ functions fall back to `200` (SOL hasn't been $200 since late 2024). This means any price feed failure silently inflates every USD calculation by ~35-50%.

**Fix**: All functions should use `_shared/sol-price-fetcher.ts`. Remove all local `getSolPrice()` implementations and hardcoded `200` fallbacks.

---

## CATEGORY 3: BOTTLENECKS

### 3A. `pumpfun-token-fetcher` makes 3 sequential API calls per new token
For every new token discovered, it calls:
1. `fetchPumpFunCoin()` — Mayhem check (pump.fun API)
2. `analyzeTokenRisk()` — Holder analysis (Solana Tracker API)
3. Then inserts to DB

With 200 tokens fetched and potentially 50+ new ones, that's 100+ API calls in a single invocation, all sequential with only 50ms delay.

**Fix**: Batch the DB lookups (already done) but also consider skipping the per-token pump.fun call since the token data was already fetched from pump.fun in step 1 — the mayhem check could use the same data.

### 3B. The fetcher already HAS pump.fun data but calls the API again for Mayhem
`fetchLatestPumpfunTokens()` already calls `fetchPumpFunNewCoins()` which returns `total_supply` and `program` fields. Then `checkMayhemMode()` calls `fetchPumpFunCoin()` AGAIN for the same token to check those exact same fields.

**Fix**: Pass the already-fetched data into the mayhem check instead of making a second API call.

---

## CATEGORY 4: STALE / MISLEADING DATA

### 4A. Hardcoded `$200` SOL fallback across 7+ functions
As noted above, SOL at `$200` was months ago. When price feeds fail (which happens), every USD metric silently becomes wrong — market caps, volumes, revenue calculations, position values. There are no alerts when a function falls back to the hardcoded value.

**Fix**: Use the shared fetcher and if it fails completely, log an alert. Never silently use a stale number.

### 4B. `sol_price_cache` table may itself be stale
Several functions read from `sol_price_cache` but there's no guarantee the cache is recent. If the cache updater fails, every consumer silently uses the last value — which could be hours or days old.

**Fix**: Add a staleness check: if `updated_at` is older than 5 minutes, don't trust it, fetch live.

---

## CATEGORY 5: BAD CYCLE / LOGIC ISSUES

### 5A. Fetcher + Watchlist Monitor both do Mayhem checks redundantly
- `pumpfun-token-fetcher` runs Mayhem check and sets `mayhem_checked = true` on insert
- `pumpfun-watchlist-monitor` checks `if (!token.mayhem_checked)` and runs the check again

Since the fetcher always sets `mayhem_checked = true`, the monitor's check should never fire. But the code is there, and if there's ever a race condition or direct DB insert, it will make unnecessary API calls.

**Not urgent** but the monitor's mayhem check is dead code.

---

## Proposed Implementation Plan

### Step 1: Kill the fake data in `coin-scanner`
Remove all `Math.random()` fallbacks. Return `null` for missing fields. If a token has no real data, skip it entirely.

### Step 2: Fix `enhanced-revenue-collector` hardcoded SOL price
Replace `const solPriceUSD = 200` with `import { getSolPrice } from '../_shared/sol-price-fetcher.ts'` and call it.

### Step 3: Fix fabricated liquidity in `pumpfun-token-fetcher`
Replace `liquidity: { usd: coin.usd_market_cap * 0.1 }` with `liquidity: { usd: null }`.

### Step 4: Consolidate SOL price fetching
Update `pumpfun-token-fetcher`, `pumpfun-watchlist-monitor`, `pumpfun-rejected-reviewer`, `pumpfun-new-token-monitor`, `pumpfun-vip-monitor`, `pumpfun-sell-monitor`, and `pumpfun-fantasy-sell-monitor` to use the shared `_shared/sol-price-fetcher.ts` instead of their local implementations with hardcoded `200` fallbacks.

### Step 5: Extract `checkMayhemMode` to shared utility
Create `_shared/mayhem-check.ts` and update all 4 consuming functions.

### Step 6: Eliminate double pump.fun call in token fetcher
Pass the already-fetched coin data into the mayhem check instead of making a second API call per token.

### Step 7: Add staleness guard to `sol_price_cache` readers
Any function reading from `sol_price_cache` should reject values older than 5 minutes and fall back to live fetch.

---

### Priority Order
1. **Coin-scanner fake data** — actively producing garbage output
2. **Revenue collector hardcoded price** — silently wrong revenue math
3. **Fabricated liquidity** — misleading watchlist data
4. **SOL price consolidation** — 7+ functions at risk of silent $200 fallback
5. **Shared mayhem check** — reduces pump.fun API load
6. **Double API call elimination** — reduces pump.fun API load further
7. **Cache staleness guard** — prevents silent stale data

