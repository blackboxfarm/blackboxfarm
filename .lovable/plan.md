

## Fix: TG BLACKBOX Posts Showing "$TOKEN" Instead of Real Ticker

### Root Cause
Found in `src/components/BaglessHoldersReport.tsx` lines 528-566. When a holders report is generated on the website, it sends a notification to the BLACKBOX Telegram channel via `admin-notify`. Two problems:

1. **Line 530**: `const symbol = tokenData?.metadata?.symbol || 'TOKEN'` — the fallback is the literal string "TOKEN", so if metadata hasn't loaded, it posts `$TOKEN` literally
2. **Lines 547 & 561**: The `$` symbol is hardcoded (`$${symbol}`) — this was missed when we stripped `$` from all other bot outputs to prevent other bots from triggering on cashtags

### What the User Sees
The BLACKBOX TG channel receives:
- `🔔 *Holders Report: $TOKEN*` (title from admin-notify)
- `🪙 *$TOKEN*` (message body)

Instead of the actual ticker like `BONK` or `WIF`.

### Fix

**File: `src/components/BaglessHoldersReport.tsx`**

1. **Better symbol resolution** (line 530): Pull symbol from the report data first, then tokenData metadata, with a smarter fallback:
   ```
   const symbol = reportData?.symbol || reportData?.tokenSymbol || 
                   tokenData?.metadata?.symbol || mint.slice(0, 6);
   ```

2. **Remove `$` prefix** (line 547): Change `$${symbol}` → just `${symbol}` (no dollar sign, consistent with all other bot outputs)

3. **Remove `$` from title** (line 561): Change `Holders Report: $${symbol}` → `Holders Report: ${symbol}`

### Also check the `HoldersReport` interface
The bagless-holders-report edge function returns `symbol` in its response — need to verify the interface includes it, or access it from the raw response data.

| File | Change |
|------|--------|
| `src/components/BaglessHoldersReport.tsx` | Fix symbol resolution, remove `$` prefix from TG notification |

