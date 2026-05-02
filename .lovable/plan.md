## Why $UNCRAFT and $MCUNC came out thin

You and I co-wrote the $GPT report by hand. Then we built the funnel + writer to mass-produce reports in that style. The writer prompt and few-shot are correct — what's missing is the **evidence**.

Look at what makes the GPT report rich:
- Funder → dev SOL transfer with exact timestamp ("89.1 SOL, 17 min PRE-launch")
- Launch transaction decoded: dev-buy 791M (79%) + sniper 207M (21%) inside the same atomic tx
- Dev wallet's final on-chain action ("CloseAccount at 14:03:07 UTC")
- Dump cascade reconstructed: 20+ txs in 6 seconds at 14:12:34
- USDC consolidation pattern post-dump (1,061 USDC chunks)
- Holders count, exact ATH timestamp, exact death timestamp

Now look at what `autopsy-writer` actually feeds Gemini:
- `lifecycle` row, `dev_behavior_scores` (just aggregate numbers like `dump_velocity_score: 80`)
- `dev_wallet_reputation` row
- `token_social_links` rows
- `enrichCandidate` (socials, boosts, holders_at_ath, dev_holding_pct)
- `dev_dossier` (cluster history)
- TG/X scrape blobs

**Zero transaction-level forensics.** No funder resolution, no launch tx decode, no signature timeline, no dump-cascade reconstruction. So Gemini fills the gap with vague prose — which is exactly what you saw in #2 and #3.

Plus: the new `admin_manual` button kicks `autopsy-writer` immediately, before any community sweep / TG pull / vulture sweep has had a chance to run on a brand-new candidate. That's why $MCUNC was the worst of the three.

## The plan — close the gap in 4 changes

### 1. New edge function `autopsy-tx-timeline`

Pulls the deterministic on-chain forensics every report needs. Helius RPC only — no AI.

For a given `token_mint` + `creator_wallet`:

- **Launch tx**: find the `CreateV2`/initialize tx, decode inner instructions to extract every buy that landed in the same tx (dev_buy_amount, sniper buys, % of bonding curve consumed).
- **Funder resolution**: walk the dev wallet's first inbound SOL transfer → record funder address, amount, timestamp, "minutes before launch".
- **Dev wallet activity**: full signature list with timestamps, classified (token-buy, token-sell, close-account, transfer-out, idle).
- **Dump cascade**: scan AMM swap txs against the pair, find the largest 60s window of net-sell volume → record start time, tx count, SOL out, price impact.
- **Post-dump flow**: track funder/dev outbound transfers for 30 min after cascade — flag USDC swaps, exchange deposits, mixer addresses.
- **Final on-chain trade**: last swap on the pair → that's "Time of Death".

Persist to a new `autopsy_tx_evidence` row keyed on `candidate_id` (jsonb columns for each section + a denormalized summary). Write the same payload to `autopsy_evidence_blobs` kind `tx_timeline` so existing readers pick it up.

### 2. Wire `autopsy-writer` to consume it

Before the AI call:
- Invoke `autopsy-tx-timeline` (await, not fire-and-forget — this IS the substance).
- Read back the evidence row.
- Inject 3 new structured sections into the user prompt:
  - `## LAUNCH TX FORENSICS` — funder, dev-buy %, sniper(s), atomic-snipe verdict
  - `## DEV WALLET TIMELINE` — chronological actions with UTC timestamps
  - `## DUMP CASCADE` — start time, tx count, SOL extracted, price impact, post-dump consolidation pattern
- Tighten the system prompt: "Section 3 (Timeline) and Section 4 (Mechanic) MUST cite specific UTC timestamps and SOL amounts from LAUNCH TX FORENSICS and DEV WALLET TIMELINE. If those sections are empty, write 'on-chain forensics unavailable' rather than inventing prose."

### 3. Fix the `admin_manual` shortcut

In `AutopsyQueueBody.tsx` the manual-add button currently invokes `autopsy-writer` immediately. Change it to invoke a small orchestrator order:

```
autopsy-tx-timeline   (new — deterministic, ~10s)
autopsy-tg-deep-pull  (existing)
autopsy-community-sweep (existing — vulture + dissent)
autopsy-writer        (existing)
```

Run them sequentially with status updates so the admin sees progress. Manual entries get the same enrichment depth as funnel-fed ones.

### 4. Add a "Re-Forensics" admin button

Next to the existing "Re-generate" button on each draft row in `/super-admin/autopsy-queue`, add **"🔬 Re-Forensics"** that re-runs `autopsy-tx-timeline` then `autopsy-writer` with `regenerate=true`. This lets you fix any of the existing thin reports ($UNCRAFT, $MCUNC) by replaying them against the new evidence layer.

## Technical details

**New table**: `autopsy_tx_evidence`
```
candidate_id uuid PK references autopsy_candidates(id)
token_mint text not null
creator_wallet text
funder_wallet text
funder_funded_amount_sol numeric
funder_funded_at timestamptz
launch_tx_signature text
launch_tx_at timestamptz
dev_buy_amount_tokens numeric
dev_buy_pct_of_curve numeric
co_snipers jsonb            -- [{wallet, amount, pct}, ...]
dev_signatures jsonb        -- [{sig, ts, kind, summary}, ...]
dev_final_action_at timestamptz
dev_final_action_kind text
dump_cascade jsonb          -- {start_at, end_at, tx_count, sol_out, pct_drop}
post_dump_flow jsonb        -- [{ts, kind, amount, dest}, ...]
time_of_death_at timestamptz
collected_at timestamptz default now()
```

**Helius calls budgeted per token**: ~6-10 RPC calls (getSignaturesForAddress on dev + funder, getTransaction on launch + cascade window, getTokenAccountBalance). Well inside your 10M monthly quota even at 100 reports/day.

**Order of build**: (1) edge function + table, (2) writer integration + prompt update, (3) UI buttons, (4) replay $UNCRAFT and $MCUNC to verify quality lift.

**Out of scope here** (separate plan if you want):
- Cluster-wide tx-flow graph
- Cross-token funder reuse detection
- Image-based banner forensics

After approval I'll switch to build mode and ship 1→4 in order.