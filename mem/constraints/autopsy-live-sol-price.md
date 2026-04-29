---
name: Autopsy Live SOL Pricing
description: Token autopsy reports must fetch live SOL/USD price at write time; never use stale or hardcoded reference prices in PnL tables.
type: constraint
---
When generating or rewriting any Token Autopsy report (in `/mnt/documents/autopsies/` or `public/autopsies/`):

1. ALWAYS fetch the live SOL/USD price at the moment of authoring (CoinGecko `simple/price?ids=solana&vs_currencies=usd`, Helius, or DexScreener — same precedence as the SOL Price Fetch memory).
2. Embed the exact reference price + source + timestamp in the PnL section header, e.g. *"Live SOL reference: $83.24 USD (CoinGecko, 2026-04-29)"*.
3. Recalculate every USD figure from the live price — never carry forward USD numbers from prior autopsy versions.
4. Stale price (>5 min old at publish) is forbidden — credibility-critical.

**Why:** Public autopsy reports are credibility artifacts. A wrong SOL price (e.g. $150 when spot is $83) inflates rugger profit estimates by ~80% and undermines every number in the report.
