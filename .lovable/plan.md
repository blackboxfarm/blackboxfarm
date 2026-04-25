# 🎯 Goal — Race the "Funded by" Trail to KYC, Solscan-Style

You're 100% right: Solscan reaches Binance in ~10 hops because it does a **linear recursive click** — follow the single biggest funder until it hits a known exchange. Our `auto-genealogy.ts` tracer fans out 3-wide and bails at depth 8 with a 0.1 SOL floor, so it dies at hop 2 on dust-funded mints like `$HONESTSHRUG`.

We **already have** the right algorithm (`wallet-genealogy-scanner` runs depth=20, branch=1, min=0.05) — it's just not wired into the auto-trace path that runs on rejection. Fix is small.

---

## The Change (1 file, ~10 lines)

**`supabase/functions/_shared/auto-genealogy.ts`**

| Constant | Current | New | Why |
|---|---|---|---|
| `MAX_DEPTH` | `8` | `20` | Match Solscan's reach; KYC roots commonly sit at 8–15 hops |
| `MIN_SOL` | `0.1` | `0.01` | Catches dust-funded temp wallets (your `$HONESTSHRUG` case) |
| Branching | top-3 funders | **top-1 funder only** (top-2 if depth ≤ 3) | Linear walk = `20 × 1 RPC` instead of `3²⁰`. Same cost as Solscan. |
| Signature lookback | `limit: 20`, slice 10 | `limit: 50`, slice 25 | Wallet may have many outgoing txs hiding the funder |
| Early-exit on CEX | already done ✅ | keep | Stops the moment we hit Binance/Coinbase/etc. |

**Cost math:** A 20-hop linear chase = **20 Helius enhanced-tx calls** (~20 credits). Current 8-hop × top-3 with branching = up to **3⁰+3¹+…+3⁷ ≈ 9,840 calls** in the worst case (we cap visited so it's lower in practice, but still 10–40×). The new version is actually **cheaper and deeper**.

---

## Optional Hop-2 Polish

Add an explicit "trail lost" reason to `GenealogyResult`:
- `"hit_cex"` → success, KYC found
- `"depth_cap"` → hit 20 hops, still wallet (rare)
- `"no_funders_above_threshold"` → wallet has no incoming SOL ≥ 0.01 (true dead-end)
- `"unclassified_funder"` → funded by a wallet we can't classify (DEX router, bridge, swap aggregator)

This surfaces in the UI/Telegram report as **"Trail ended at hop X — funded by unclassified `4xQR…` (likely Jupiter aggregator)"** instead of a silent stop.

---

## Verification Plan

1. After deploy, manually invoke `wallet-genealogy-scanner` with `tempg6Y1TeRAYm5aHG43yGAtV5UYCNuHFpC17hmYAWz` (the wallet from your screenshot) and confirm it resolves to **Binance 2** in the response.
2. Re-run the auto-tracer on `$HONESTSHRUG` and check `dev_wallet_reputation.upstream_wallets` populates with the full chain ending at the Binance deposit address.
3. Spot-check Helius credit usage in the next 24h — expect a **decrease** (not increase) thanks to linear vs branching.

---

## What I'm **NOT** Touching

- `wallet-genealogy-scanner` (already correct, used by Bubblemap deep scans)
- `cex-wallets.ts` (Binance 2 is already known — not a coverage gap)
- The 3-hour retry cadence (separate concern; this fix should resolve the trail in the **first** try)

---

## Memory Update

I'll refresh `mem://features/oracle/dev-genealogy-tracing` to document the new defaults (20 hops, 0.01 SOL, linear walk) so future tracer work doesn't accidentally regress to the branching pattern.
