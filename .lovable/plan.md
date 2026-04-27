# Why Shared KYC is empty — and how we fix it

## What the data says

I queried `telegram_insider_token_lifecycle`:

| Metric | Count |
|---|---|
| Total tokens | 1,329 |
| With creator wallet | 448 |
| With genealogy chain | 393 |
| With KYC root | **0** |
| Chains ≥ 10 hops deep | 90+ |
| Chains ≥ 20 hops (hit depth cap) | 16 |

Sample chains show every funder hop has `cexName: null` — the tracer walks upstream but never matches a known exchange address. So **Shared KYC = 0 is a data-coverage gap, not a UI bug**.

## Creator vs Funder vs KYC root

```text
   KYC root (exchange hot wallet)        ← real-world identity tie
        │
        ▼ withdraw
   Funder wallet(s)                      ← intermediaries / bankroll
        │
        ▼ fund mint fees
   Creator wallet                        ← signs the token mint
        │
        ▼ create
   Token
```

- **Creator** = wallet that signed the mint instruction. One per token.
- **Funder** = any upstream wallet that sent SOL to the creator (or to the creator's funder). Many per chain.
- **KYC root** = a funder that matches our CEX hot-wallet dictionary. Cracking this links a token to a real person.

"Shared Funder (50)" already finds bankroll wallets feeding multiple creators — that's the actual smoking gun. KYC root is the cherry on top: it identifies the exchange (and ultimately the person) behind the bankroll.

## Why we're stuck at 0 KYC roots

Three independent reasons, all fixable:

1. **CEX dictionary is too small.** `cex-wallets.ts` covers Binance, Coinbase, and a handful more (~176 lines). Solana scammers commonly withdraw from **Bybit, OKX, MEXC, Gate.io, Kucoin, Bitget, Kraken, Crypto.com, HTX, Bitfinex, Robinhood**. None (or very few) are in our list, so we walk past them.
2. **Top-1 funder bias drops the real KYC source.** `auto-genealogy.ts` follows only the biggest funder per hop (top-2 only at depth ≤3). The actual CEX deposit is often a smaller "seed" tx, not the largest one.
3. **`MAX_DEPTH = 20` cap.** 16 chains hit the cap and stopped. Some chains in the DB are 33 hops deep — these creators are deliberately laundering through fresh wallets, and we abandon the trail before reaching an exchange.

## Proposed fixes

### 1. Expand the CEX wallet dictionary (highest ROI)

Add the major missing exchanges to `_shared/cex-wallets.ts`:
- Bybit, OKX, MEXC, Gate.io, Kucoin, Bitget, Kraken, Crypto.com, HTX, Robinhood, Bitfinex, Bingx
- Pull addresses from Arkham/Solscan public labels
- Keep the format identical (`Record<exchange, addresses[]>`)

Expected impact: probably converts a sizable fraction of existing 393 chains from "no KYC" → "has KYC root" instantly on next retrace, no new RPC calls needed for the dictionary itself.

### 2. Add CEX-aware branching at each hop

In `auto-genealogy.ts traceDepth()`, before picking the top-1 funder, scan **all** parsed funders at this hop for a CEX match. If any funder is in the CEX dictionary, lock that as the KYC root immediately — don't keep chasing the bigger one. This catches "small CEX seed + larger peer-to-peer top-up" patterns.

### 3. Surface the trail-end reason in the admin UI

Right now we silently lose tokens to `depth_cap`, `unclassified_funder`, `rpc_error`, etc. Add a small diagnostic strip to `XCommunityQueueEtaCard` (or a new `GenealogyHealthCard`) showing:
- Tokens by `trailEndReason` (we already write this — just need to read it)
- "Stuck at depth cap" count with a "Re-trace deeper" button
- "Unclassified funder" count → tells us which exchange dictionary to add next

### 4. One-shot backfill: retrace existing chains

After fix #1 + #2 ship, add a `backfill-genealogy-kyc` edge function that:
- Selects tokens where `genealogy_chain IS NOT NULL AND genealogy_kyc_root IS NULL`
- For each, scans the **existing chain** wallets against the **new** CEX dictionary first (zero RPC cost — pure DB)
- Only if no match, optionally re-walks with the new branching logic
- Updates `genealogy_kyc_root` and writes the cexName into the chain entries

Most of the 393 chains will resolve in step 1 with **zero new RPC spend** because the upstream wallets are already saved in `genealogy_chain` — we just need to re-check them against the bigger dictionary.

### 5. (Optional, lower priority) Raise MAX_DEPTH for "important" tokens

For tokens with peak_multiplier ≥ 5x or rugged + high notional, allow a `MAX_DEPTH = 30` retrace as a one-time deep-dive. Costs more Helius credits but only on tokens that earned the investigation.

## Technical details

**Files to edit:**
- `supabase/functions/_shared/cex-wallets.ts` — add ~10 exchanges, ~50–80 new addresses
- `supabase/functions/_shared/auto-genealogy.ts` — add per-hop CEX scan before picking top-1 (lines 150–250 area)
- `src/components/admin/` — new `GenealogyHealthCard.tsx` reading trail-end stats
- `supabase/functions/backfill-genealogy-kyc/index.ts` — new edge function, dictionary-only retrace first, RPC retrace as opt-in

**No DB schema changes needed.** Columns already exist (`genealogy_kyc_root`, `genealogy_chain`, `genealogy_depth`).

**Cost estimate:**
- Dictionary expansion: $0
- Backfill pass 1 (DB-only re-scan): $0
- Backfill pass 2 (RPC re-walk for stuck chains): ~$2–4 in Helius credits for ~400 tokens
- Ongoing: same cost as today; better hit rate for free

## Out of scope

- Changing the "follow biggest funder" heuristic globally (risky — would change historical traces)
- Adding mixer detection (Tornado/Wasabi-equivalent on Solana) — separate project
- Cross-chain KYC tracing (CEX deposits from Ethereum bridge, etc.) — separate project
