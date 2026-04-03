

## Root Cause: Field Name Mismatch

The `token-creator-linker` function expects `{ tokenMints: [...] }` in the request body (line 119), but the **primary caller** — `dexscreener-top-200-scraper` — sends `{ tokens: [...] }` (line 596).

This means every time the scraper discovers new tokens and triggers the linker, the linker throws `"tokenMints array required"` → HTTP 500.

### Where token-creator-linker is used

| Caller | File | Sends | Works? |
|--------|------|-------|--------|
| **dexscreener-top-200-scraper** | `supabase/functions/dexscreener-top-200-scraper/index.ts:594-598` | `{ tokens: [...] }` | **No — this is the bug** |
| oracle-unified-lookup | `supabase/functions/oracle-unified-lookup/index.ts:533` | `{ tokenMints: [...] }` | Yes |
| oracle-historical-backfill | `supabase/functions/oracle-historical-backfill/index.ts:223` | `{ tokenMints: [...] }` | Yes |
| holdersintel-bot-webhook | `supabase/functions/holdersintel-bot-webhook/index.ts:1686` | `{ tokenMints: [...] }` | Yes |
| IntelReport.tsx (client) | `src/pages/IntelReport.tsx:193` | `{ tokenMints: [...] }` | Yes |
| DevIntelReport.tsx (client) | `src/components/admin/oracle/DevIntelReport.tsx:185` | `{ tokenMints: [...] }` | Yes |

The scraper is the only caller using the wrong field name, and it runs on every 5-minute cron tick — hence the 100% failure rate.

### Fix

**File**: `supabase/functions/dexscreener-top-200-scraper/index.ts` (line 596)

Change `tokens` to `tokenMints`:
```
tokens: newTokens.map(t => t.address)
```
→
```
tokenMints: newTokens.map(t => t.address)
```

One line fix. Redeploy `dexscreener-top-200-scraper`.

### Additionally (defensive)

Make `token-creator-linker` accept both field names so future callers don't hit the same trap:
```typescript
const body = await req.json();
const tokenMints = body.tokenMints || body.tokens;
```

Two files changed, one line each. Redeploy both functions.

