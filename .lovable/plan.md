

## Honest Genealogy Labels + Deeper Tracing

### Problem
The system labels the **last wallet in the chain** as "KYC Root" even when it's just where the Helius API trail went cold. A real KYC root is a CEX hot wallet (Binance, Coinbase, etc.) — anything else means "we couldn't trace further." This misleads users into thinking the chain is complete.

### Changes

#### 1. Add new source types and labels

Introduce honest labels across 3 files:

- **`CEX`** — confirmed exchange wallet (real KYC root)
- **`DEEPEST_FUNDER`** — trail went cold, not confirmed as CEX
- **`TRAIL_COLD`** — max depth reached or no more transactions found

#### 2. Fix `oracle-master-spider/index.ts` (lines 680-684, 710)

Currently sets `kycRoot` to the last parent even when no CEX was found. Change to:
- Only set `kycRoot` when a CEX is confirmed (line 648 already does this correctly)
- Remove the fallback on lines 682-684 that overwrites kycRoot with the last parent
- Add a new field `kycConfirmed: boolean` to distinguish real vs assumed roots
- Update the step summary (line 714-715) to say "CEX Root" vs "Deepest Funder"

#### 3. Fix `_shared/holder-intelligence.ts` (lines 366-379)

Currently labels the deepest non-CEX parent as `KYC_ROOT`. Change to:
- Label as `CEX` if `cexName` is present
- Label as `DEEPEST_FUNDER` if it's the deepest wallet but NOT a CEX
- Keep `FUNDER` for intermediate wallets
- Set `kycRootWallet` only when a CEX is actually found, otherwise set `kycRootConfirmed: false`

#### 4. Fix `wallet-genealogy-scanner/index.ts` (line 218)

Change `source_type: "unknown"` at max depth to `"trail_cold"` — add `"trail_cold"` to the WalletNode source_type union.

#### 5. Increase default trace depth

- `wallet-genealogy-scanner`: default `maxDepth` from 5 → 8
- `_shared/auto-genealogy.ts`: `MAX_DEPTH` from 6 → 8
- `backfill-genealogy`: default depth from 3 → 5

#### 6. Update UI labels

Search for UI components displaying "KYC Root" and add conditional text:
- If CEX confirmed: "🏦 KYC Root (Binance)" 
- If trail cold: "🔍 Deepest Funder (trail cold at depth X)"

This affects `PublicBubbleMap.tsx` terminal output and the holders report genealogy display.

### Files Changed
1. `supabase/functions/oracle-master-spider/index.ts` — honest kycRoot assignment
2. `supabase/functions/_shared/holder-intelligence.ts` — honest labels
3. `supabase/functions/wallet-genealogy-scanner/index.ts` — trail_cold type, depth 5→8
4. `supabase/functions/_shared/auto-genealogy.ts` — depth 6→8
5. `supabase/functions/backfill-genealogy/index.ts` — depth 3→5
6. `src/components/bubble-map/PublicBubbleMap.tsx` — conditional KYC vs Deepest Funder display
7. Deploy affected edge functions

