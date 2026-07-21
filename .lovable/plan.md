## Goal

Today we stop the KYC trace at the CEX hot wallet (Binance, Coinbase…), so 130 unrelated devs all get bucketed under "Binance." That's useless.

You want the same behavior as Bubblemap: walk the funding chain all the way back and capture **the wallet that actually withdrew from the CEX** — the individual's personal wallet. If two dev wallets share that same pre-CEX withdrawal wallet, that's one person, and both their tokens should collapse into one row.

## What we already have

`wallet-genealogy-scanner` (used by Bubblemap) already walks the full ancestor chain via Helius and marks the shallowest CEX hit. We just don't persist the *step before* the CEX for the Insiders Recaps pipeline.

## Plan

### 1. DB — add person-root columns to `insiders_recap_entries`

- `person_root_wallet TEXT` — the wallet directly funded by the CEX (the withdrawal recipient)
- `person_root_via_cex TEXT` — which CEX it came from ("Binance", "Coinbase"…), audit only
- `person_root_depth INT` — hop distance dev → person root (usually 1–4)
- `person_root_resolved_at TIMESTAMPTZ`
- Index on `person_root_wallet`

### 2. New edge function `insiders-person-root-resolver`

- Input: dev_wallet (or batch)
- Reuses the Bubblemap tracer (`wallet-genealogy-scanner` logic) to walk ancestors up to depth 20, largest-inflow-first
- Finds the **deepest non-CEX wallet whose parent is a CEX hot wallet** — that's the person's withdrawal wallet
- If chain terminates at Axiom/deBridge/MoonPay/other privacy hop instead of a CEX, returns that hop wallet + flags `person_root_source='privacy_hop'` (so we don't fake CEX attribution)
- Writes back to `insiders_recap_entries` for every entry with that dev_wallet
- Rate-limited, resumable, backfill-safe (skips rows already resolved <7d ago)

### 3. Wire into ingest

- After `insiders-recaps-ingest` resolves dev + CEX root, enqueue that dev into `insiders-person-root-resolver`
- Same call inside `alpha-dev-detector` so a *new* incoming mint gets its person root resolved within seconds — that's the "backtrace it in a second" you asked for

### 4. UI — `/insiders-recaps` KYC Groupings tab

- Group by `person_root_wallet` instead of `kyc_root_wallet` when available; fall back to CEX root only when the person root is unresolved
- Row label: `Person <short>…<short>` (or a saved nickname if we've seen this person before)
- Sub-line: "funded via Binance / Coinbase / privacy-hop"
- The existing "Hiding CEX/bridge infra" toggle stays, but with person-rooting the CEX-only rows will naturally disappear
- Add a "Resolve person roots" button next to "Rebuild recaps" to trigger a bulk pass

### 5. Backfill

Kick a one-time pass over the ~60 existing devs. Expected Helius cost: ~60 devs × ~10 hops × 1 call = ~600 calls, well inside budget.

## Technical notes

- Reuses `known_cex_wallets` (already the source of truth) plus the same `INFRA_WALLETS` terminus list used by Bubblemap so we don't chase Jupiter/Raydium into oblivion.
- Person root is stored per-entry (not per-dev) so a dev who rotates funding sources gets independently attributed rows — matches how Bubblemap displays multi-source funding.
- Alpha-detector match rule becomes: match on dev_wallet OR person_root_wallet OR (fallback) kyc_root_wallet-but-only-if-non-CEX — no more Binance false positives on the SMS trigger.

Approve and I'll build it.