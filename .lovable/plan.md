# Wallet Genealogy & Cross-Link Detection for Insiders Channel

## What I confirmed in your codebase

**The plumbing is already there — it just isn't being shown to you and isn't being run on the existing 1,055 rows.**

- `telegram_insider_token_lifecycle` already has columns `creator_wallet`, `genealogy_depth`, and `genealogy_kyc_root`.
- `_shared/auto-genealogy.ts → traceParentWallets()` already walks the funding tree via Helius Enhanced Transactions API (top-3 funders per hop, MAX_DEPTH=8, min 0.1 SOL, with 9 known CEX wallets tagged as "KYC Root").
- `insiders-lifecycle-builder` already calls it and writes back `genealogy_depth` + `genealogy_kyc_root`.
- All discovered hops are also pushed into `reputation_mesh` as `directly_funded` / `indirectly_funded` edges with confidence scores.

**Current state of the data:**
| Metric | Value |
| --- | --- |
| Lifecycle rows total | 1,055 |
| Rows with creator wallet resolved | 750 |
| Rows with KYC root resolved | **0** ← the bug |
| Creators that already minted ≥2 tokens in this batch | 15+ visible (e.g. `8ZN71X…686FP` minted CAM, AIB, chloe; best peak 583x) |

The drill-down dialog only renders `Creator: <wallet>` — it never reads the parent-wallet ladder or the KYC root, even though the `reputation_mesh` rows are sitting in the database for many of them. That's why $RISE looks like Mint→KYC with nothing in between.

---

## The 3 things to fix

### 1. Backfill the trace on every existing row that has a creator (305 missing + ~750 never run)

Add a **"Trace KYC roots"** button next to the existing "Rebuild from messages" / "Promote ≥3x to Mesh" buttons in `InsidersLifecycleTab.tsx`. It calls a new edge function `insiders-genealogy-backfill` that:

- Selects every row where `creator_wallet IS NOT NULL AND (genealogy_kyc_root IS NULL OR enrichment_last_run_at < now() - 7 days)`.
- For each, calls `traceParentWallets(creator)` and writes back `genealogy_depth`, `genealogy_kyc_root`, plus a new JSONB column `genealogy_chain` (added below) containing the full ordered ladder `[{wallet, depth, amountSol, cexName?}]`.
- Uses a 200ms throttle between wallets (matches the existing Helius governance memo) and processes in batches of 50 per invocation, returning `{processed, remaining}` so the UI can loop until 0.

**Why CEX detection sometimes misses Binance after 7-8 hops:** the shared `CEX_WALLETS` map only has 9 addresses. Your $RISE example confirms a real Binance hot wallet that isn't in that list. I'll cross-reference the existing `_shared/cex-wallets.ts` (176 lines, 150+ exchange addresses per the genealogy memory) and replace the inline 9-entry map in `auto-genealogy.ts` with the canonical import, so future traces resolve Binance/Coinbase/Kraken/etc reliably.

### 2. Show the full wallet ladder in the drill-down dialog

Replace the single `Creator: <wallet>` line with a structured "Funding Lineage" section:

```
Mint Wallet     35jp…Fpump          (— minted token)
   ↓ funded by 1.42 SOL
Hop 1           D7o5…3qv1            (creator wallet)
   ↓ funded by 0.85 SOL  
Hop 2           AbCd…wXyZ
   ↓ funded by 2.10 SOL
…
🏦 KYC Root     5tzF…uAi9    [BINANCE]
```

Each row has a Solscan deep-link, a copy-button, and the SOL amount that funded it. The new `genealogy_chain` column drives this directly — no extra queries on render.

If the chain terminates without hitting a CEX, show `🌑 Trail lost at depth N — funder: <wallet>` so you know the trace ran but didn't reach KYC.

### 3. Cross-link detector (the "RedFlag/GreenFlag" feature you asked for)

Add a new section below the table called **"Wallet Cross-Links"** with three tabs:

**A. Shared Creator Wallet** — group lifecycle rows by `creator_wallet HAVING count(*) > 1`. For each cluster show: creator address, member tokens (symbol + peak X badge color-coded green/red), and a one-line verdict (e.g. "3 tokens • 2 over 5x • 0 rugs → 🟢 Repeat Winner" or "4 tokens • 0 over 2x • 3 rugs → 🔴 Serial Saddev").

**B. Shared Intermediary Funder** — query `reputation_mesh` for `relationship IN ('directly_funded','indirectly_funded')` where `linked_id` is in our creator set, group by `source_id` (the funder), filter to funders that appear in ≥2 different families. Same color-coded verdict.

**C. Shared KYC Root** — group by `genealogy_kyc_root`. This is the most powerful: shows every Insiders token that ultimately traces back to the same Binance/Coinbase/etc deposit address. A single CEX deposit funding 5 Insiders-channel tokens is a very loud signal whether they're all winners or all rugs.

Each cluster row is clickable → opens the existing drill-down for that token. Clusters with mixed outcomes (some winners, some rugs from same root) get a yellow "⚠ Mixed-Outcome Family" flag.

---

## Schema change (one migration)

```sql
ALTER TABLE telegram_insider_token_lifecycle
  ADD COLUMN IF NOT EXISTS genealogy_chain jsonb;

CREATE INDEX IF NOT EXISTS idx_lifecycle_kyc_root
  ON telegram_insider_token_lifecycle (genealogy_kyc_root)
  WHERE genealogy_kyc_root IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lifecycle_creator
  ON telegram_insider_token_lifecycle (creator_wallet)
  WHERE creator_wallet IS NOT NULL;
```

No new tables — `reputation_mesh` already holds the funder edges with the right relationship strings.

---

## Files I will create or edit

| File | Change |
| --- | --- |
| `supabase/functions/_shared/auto-genealogy.ts` | Replace inline 9-entry `CEX_WALLETS` with import from `_shared/cex-wallets.ts`; have `traceParentWallets` also return the ordered chain so the builder can persist it. |
| `supabase/functions/insiders-lifecycle-builder/index.ts` | Persist the new `genealogy_chain` JSONB alongside existing `genealogy_depth` / `genealogy_kyc_root`. |
| `supabase/functions/insiders-genealogy-backfill/index.ts` (new) | Batch backfill for the 750+ rows that never got traced; returns `{processed, remaining}`. |
| `supabase/functions/insiders-cross-links/index.ts` (new) | Read-only aggregator: returns the three cluster lists (shared creator / shared funder / shared KYC root) with peak-X stats per token. |
| `src/components/admin/tabs/InsidersLifecycleTab.tsx` | Add "Trace KYC roots" button (loops until remaining=0); add Funding Lineage section in drill-down; add Cross-Links panel below the table with 3 tabs. |
| Migration | Add `genealogy_chain jsonb` + 2 indexes. |

---

## What you'll see when it's done

1. Click **"Trace KYC roots"** once → progress toast counts down 1055 → 0 over a few minutes (Helius cost: ~10 calls per wallet × 750 wallets ≈ 7,500 credits, well inside the 10M monthly quota).
2. Click any row → drill-down now shows the full ladder Mint→funder→funder→…→🏦 Binance, exactly like clicking through Solscan's "Funded by" — but pre-computed.
3. Scroll below the table → see clusters like *"3 tokens funded from same Coinbase deposit: 2 winners (45x, 12x), 1 rug → ⚠ Mixed-Outcome Family"* — the exact RedFlag/GreenFlag pattern you described.

No changes to the trading guards, the bot, or any other surface — this is purely additive intel inside the existing `/super-admin` Insiders Lifecycle tab.