

## Root Cause: MISSILE is on PumpSwap, not Raydium — system doesn't recognize it

From the DexScreener screenshot: MISSILE trades on **PumpSwap** (Pump.fun's own AMM after graduation), not Raydium. It has $86K liquidity, $1M MCap, 2,943 holders, 19h old, +1,682% in 24h. It's clearly graduated and actively trading.

### The Bug

**`dexscreener-api.ts` line 122-123**: Vitality metrics are extracted from the **first pair** returned by DexScreener. For PumpSwap tokens, DexScreener returns `dexId: "pumpswap"` — the `pairCreatedAt` and `liquidityUsd` values ARE populated correctly.

**`bagless-holders-report/index.ts` line 413**: The phase gate is:
```typescript
if (vitality.pairCreatedAt && vitality.liquidityUsd > 50000)
```

This should pass for MISSILE ($86K liquidity > $50K threshold). So either:
1. The first pair returned by DexScreener for MISSILE has lower liquidity than the PumpSwap pair (DexScreener may return a different pair first)
2. OR the `pairCreatedAt` is null for the PumpSwap pair format

**But the shared `token-phase.ts` has a harder problem**: It uses a $50K liquidity threshold designed for Raydium. PumpSwap pairs should be treated as graduated — any token on PumpSwap with liquidity has already left the bonding curve.

### The Fix (3 files, 1 shared utility)

**1. `_shared/token-phase.ts`** — Accept an optional `dexId` parameter. If `dexId` includes "pumpswap", treat the token as graduated (not on curve) regardless of liquidity threshold:
```typescript
export function detectTokenPhase(params: {
  pairCreatedAt: number | null;
  liquidityUsd: number | null;
  volumeH24?: number | null;
  dexId?: string | null; // NEW
}): TokenPhaseResult {
  // PumpSwap = graduated from bonding curve, treat as having valid pair
  const isPumpSwap = params.dexId?.toLowerCase().includes('pumpswap');
  
  if (!pairCreatedAt || (!isPumpSwap && liquidityUsd !== null && liquidityUsd < 50_000)) {
    return on_curve result...
  }
  // ... rest of phase detection
}
```

**2. `_shared/dexscreener-api.ts`** — Add `dexId` to `VitalityMetrics` and populate it from the first pair. Also, prefer the highest-liquidity Solana pair (not just `pairs[0]`):
```typescript
// In VitalityMetrics interface, add:
dexId: string | null;

// When extracting vitality, pick best pair and include dexId:
dexId: bestPair.dexId || null,
```

**3. `bagless-holders-report/index.ts` line 411-423** — Pass `dexId` through to phase detection and also recognize PumpSwap as graduated:
```typescript
const isPumpSwap = result.pairs.some(p => 
  p.dexId === 'pumpswap' && (p.liquidity?.usd || 0) > 0
);

if (vitality.pairCreatedAt && (vitality.liquidityUsd > 50000 || isPumpSwap)) {
  // ... phase classification (newborn, early, etc.)
}
```

**4. `token-ai-interpreter/index.ts` line 453** — Pass `dexId` to `detectTokenPhase`:
```typescript
const phaseResult = detectTokenPhase({ 
  pairCreatedAt, liquidityUsd, 
  dexId: reportData.vitality?.dexId || reportData.dexId || null 
});
```

**5. `holdersintel-bot-webhook/index.ts`** — Same: pass `dexId` through when detecting phase, and ensure PumpSwap tokens aren't capped to "WATCH CURVE".

### Why This Matters

PumpSwap is Pump.fun's new AMM venue. Tokens graduate from the bonding curve TO PumpSwap (instead of Raydium). The system was built when graduation meant Raydium only. Now `dexId === "pumpswap"` is definitive proof of graduation — even stronger than a liquidity check.

### Summary of Changes
- **5 files** modified across edge functions and shared utilities
- Core fix: recognize `pumpswap` as a graduated DEX venue alongside `raydium`, `orca`, `meteora`
- The `mint-monitor-scanner` already does this correctly (line 84) — the holders report and AI interpreter just need to catch up

