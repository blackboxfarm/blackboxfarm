

## Problem

The "🔴 Repeated Failures: solscan" alert fires because:

1. **404s from `solscan-free.ts`** — The FREE public API returns 404 for unindexed tokens (new pump.fun coins). These are **expected** and not real failures. The logging fix was applied earlier today but the 48 historical failures still show in the alert window.

2. **Dormant Pro code still reachable** — `solscan-api.ts` (transaction parsing) and `solscan-intelligence.ts` (wallet intel) contain live `pro-api.solscan.io` calls with no early-return guard. If any code path invokes them, they'll 401 and log as failures. Currently `flipit-repair-positions` can reach `solscan-api.ts` as a Helius fallback.

3. **`is_enabled` is still `true`** — The config table says Solscan is active, so health monitors keep flagging it.

## Plan (3 changes, all reversible)

### 1. Add disabled guards to Pro endpoint files

**`solscan-api.ts`** — Add an early-return at the top of `fetchTransactionFromSolscan()`:
```
console.log('[Solscan Pro] DISABLED — free tier key cannot access pro-api.solscan.io');
return null;
```
This propagates to `parseBuyFromSolscan` and `parseSellFromSolscan` automatically.

**`solscan-intelligence.ts`** — Add the same early-return at the top of each exported function so no Pro calls ever fire.

**Reversal:** Remove the early-return lines when/if you upgrade to Pro.

### 2. Set `is_enabled = false` in config table

Run a migration:
```sql
UPDATE api_service_config
SET is_enabled = false,
    notes = notes || ' | Disabled 2026-03-20: free tier only, Pro endpoints blocked.'
WHERE service_name = 'solscan';
```

This stops health monitors from flagging Solscan. The free `solscan-free.ts` calls still work — they don't check this flag.

**Reversal:** `UPDATE api_service_config SET is_enabled = true WHERE service_name = 'solscan';`

### 3. Deploy affected edge functions

Deploy `token-metadata`, `flipit-repair-positions`, and any function importing from `solscan-api.ts` or `solscan-intelligence.ts` to pick up the guards.

### What stays working

- `solscan-free.ts` (public-api.solscan.io) continues to fill metadata gaps — it's the only active Solscan caller and already skips logging 404s.
- All other token data flows through Helius, DexScreener, and Pump.fun as primary sources.

