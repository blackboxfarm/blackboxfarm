
# Fix: Stale Price Display from Helius Index Lag

## Problem Identified

The screenshot shows price **$0.0000054165** but Helius currently returns **$0.0000030132887** (correct). The token (Buddy) graduated from pump.fun and now trades on PumpSwap.

**Root Cause**: Helius `getAsset` returns **indexed** price data from `token_info.price_info`. This index can lag real-time prices by 30-60 seconds, especially for:
- Recently graduated tokens
- Tokens with high volatility
- Tokens just listed on DEXes

The user sees a stale price from when they first pasted, then it doesn't update.

## Solution

Add **DexScreener real-time price** as a validation/fallback for graduated tokens (not on bonding curve).

### Current Flow
```text
1. Helius getAsset → price (may be stale for graduated tokens)
2. Display price immediately
3. Background: token-metadata (no price override)
```

### Fixed Flow
```text
1. Helius getAsset → price + isOnCurve check
2. Display price immediately (fast UX)
3. IF graduated (no curve): Quick DexScreener check (async)
4. IF DexScreener price differs significantly (>5%): Update display
```

## Technical Details

### Changes to `helius-fast-price` Edge Function

Add quick DexScreener validation for graduated tokens:

```typescript
// After getting Helius price, check if graduated
const isOnCurve = ... // from bonding curve check

if (!isOnCurve && pricePerToken > 0) {
  // Graduated token - validate against DexScreener
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    const dexData = await dexRes.json();
    const dexPrice = parseFloat(dexData?.pairs?.[0]?.priceUsd);
    
    if (dexPrice > 0) {
      const deviation = Math.abs(pricePerToken - dexPrice) / dexPrice;
      if (deviation > 0.05) {
        // DexScreener is >5% different - use it (more real-time)
        return { price: dexPrice, source: 'dexscreener', ... };
      }
    }
  } catch (e) {
    // DexScreener failed, use Helius price anyway
  }
}
```

### Alternative Simpler Approach

Don't modify helius-fast-price (keep it fast). Instead:

1. Display Helius price immediately (current behavior)
2. In background, fetch DexScreener price for graduated tokens
3. If differs >5%, update the displayed price

This keeps the instant price display but corrects stale data automatically.

### Files to Modify

1. **`supabase/functions/helius-fast-price/index.ts`** - Add optional DexScreener validation for graduated tokens

OR

2. **`src/components/admin/FlipItDashboard.tsx`** - Add background price validation after initial display

## Expected Result

- Price displays instantly (~200ms from Helius)
- For graduated tokens, price auto-corrects within 500ms if stale
- User always sees real-time executable price before clicking Flip-It
