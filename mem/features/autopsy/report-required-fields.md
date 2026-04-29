---
name: Autopsy Report Required Fields
description: Mandatory fields every Token Autopsy .md must include — Time of Death is required
type: feature
---
Every Token Autopsy markdown report MUST include a **🪦 Time of Death** row in the Subject table.

**Definition:** UTC timestamp of the last meaningful on-chain trade (final candle / last swap before the chart goes flat). Format:
`**~HH:MM:SS UTC, YYYY-MM-DD** (last on-chain trade; ~Xm after dump cascade began at HH:MM:SS)`

If the token is technically still trading but functionally dead (mcap < $1k, liq < $500), use the timestamp of the dump cascade completion and label it as the **functional** time of death.

Other mandatory Subject-table fields: Mint, Symbol/Name, Launchpad, Pair, Socials, Total supply, Holders at autopsy, ATH MCap (with timestamp), Current MCap (with % from ATH), 24h price change, 24h vol/txns, Lifetime, **🪦 Time of Death**.

**Why:** Coroner-grade reporting. The whole "autopsy" framing requires a definitive time of death — without it, the forensic narrative is incomplete.
