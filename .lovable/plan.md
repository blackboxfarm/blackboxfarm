## Goal

Identify the **Exit Group** for any autopsy — the specific wallets whose sells caused the chart collapse — then prove (or disprove) their link to the dev, the dev's wallet family/KYC root, or the original bonding-curve snipers. Make this a first-class section of every autopsy report.

## What's missing today

The current pipeline (`autopsy-tx-timeline` + `autopsy-cluster-dump`) only traces the **launch-side bundle** (co-snipers in the launch tx). It never asks the symmetrical question on the **exit side**: who actually dumped, and were they pre-positioned?

Specifically:
- `detectDumpCascade()` only counts dev-wallet sells in a 60s window. It ignores all non-dev sellers on the pair.
- We never enumerate the top sellers against the pool by USD/SOL volume.
- We never trace exit wallets' **funder** or **acquisition tx** (when/how they got the tokens — airdrop from dev? sniped at launch? bought on curve?).
- We never link Exit Group ↔ Launch Snipers ↔ Dev Cluster ↔ KYC root in one graph.
- The writer prompt has no "Exit Group" section, so even if data existed it wouldn't be in the .md.

## Plan

### 1. New shared module: `_shared/autopsy-exit-group.ts`

Pure forensics, no AI. Given `{ mint, pairAddress, deathWindow: { start, end }, devCluster, launchSnipers }`, return:

```ts
{
  exit_group: Array<{
    wallet, sells_count, sol_received, usd_received,
    first_sell_at, last_sell_at,
    pct_of_window_volume,            // share of total sells in window
    acquisition: {
      mode: 'launch_sniper' | 'curve_buyer' | 'airdrop_from_dev' | 'transfer_from_cluster' | 'open_market' | 'unknown',
      acquired_at, acquired_tx, source_wallet | null,
    },
    funder: { wallet, label, is_cex, hops_to_cex },
    linkage: {
      is_dev: bool, is_kyc_root: bool, is_in_dev_family: bool,
      is_launch_sniper: bool, shares_funder_with_dev: bool,
      shares_funder_with_other_exiters: bool,
    },
    linkage_score: 0-100,           // how confidently this wallet is "with the dev"
  }>,
  exit_pattern: 'single_dump' | 'sequential_burst' | 'slow_bleed' | 'staircase' | 'mixed',
  collapse_window: { start, end, duration_sec, sol_extracted, usd_extracted, pct_of_liquidity_drained },
  exit_group_linkage_summary: {
    dev_funded_pct, cluster_funded_pct, launch_sniper_overlap_pct,
    same_funder_pct, independent_pct,
  },
  exit_verdict: 'pre_planned_exit' | 'coordinated_dump' | 'opportunistic_dump' | 'organic_distribution' | 'insufficient_data',
  notes: string[],
}
```

**Detection algorithm:**
1. Pull last N (≈1000) signatures for the pool/pair address (Helius `getSignaturesForAddress`).
2. Decode swaps; bucket by seller wallet within the **collapse window** (auto-detected: largest contiguous price-drop window where >40% of liquidity exits — fall back to the existing `detectDumpCascade` window if pool data is too sparse).
3. Rank sellers by SOL received in window. Take **top 20** OR all sellers contributing to ≥80% of window volume, whichever is smaller.
4. For each exit wallet, run in parallel (with strict Helius-call cap of ≤6 per wallet):
   - **Acquisition trace**: scan that wallet's signatures for the first inbound transfer of `mint`. Was it the launch tx (→ launch_sniper), a transfer from dev/cluster (→ airdrop/cluster), or a curve buy?
   - **Funder trace**: `discoverFunding(wallet)` (already exists).
5. Cross-reference each wallet against `devCluster` (from `wallet_family_members`), `kycRoot`, and `launchSnipers` (from `autopsy_tx_evidence.co_snipers`).
6. Promote `unknown` → `same_funder` when ≥2 exit wallets share the same upstream funder (mirrors the cluster-dump heuristic).
7. Compute `linkage_score` as a weighted sum (dev/KYC = 100, cluster = 90, launch_sniper = 80, shared funder = 60, etc.).
8. `exit_verdict`:
   - `pre_planned_exit` if dev_funded_pct + cluster_funded_pct + launch_sniper_overlap_pct ≥ 50
   - `coordinated_dump` if same_funder_pct ≥ 40
   - `opportunistic_dump` if top 1 wallet > 60% but no linkage
   - `organic_distribution` otherwise

**Cost guard:** total Helius spend capped at ~120 calls per autopsy. Skip and emit `evidence_gap: 'exit_trace_budget_exceeded'` if hit.

### 2. DB migration: extend `autopsy_tx_evidence`

Add columns:
- `exit_group jsonb` — full structure above
- `exit_pattern text`
- `collapse_window jsonb`
- `exit_group_linkage_summary jsonb`
- `exit_verdict text`

(All nullable; backfill on next re-run.)

### 3. Wire into `autopsy-tx-timeline/index.ts`

After `decodeLaunchTx()` + `buildDevTimeline()` + cluster-dump, call `traceExitGroup()` with:
- `devCluster` = the same `clusterWallets` already pulled
- `launchSnipers` = `launch.co_snipers.map(s => s.wallet)`
- Pair address = look up from DexScreener cache (already used by other autopsy steps) or Helius DAS

Persist the new fields to `autopsy_tx_evidence` in the same upsert.

### 4. Feed signals into the classifier

`_shared/autopsy-taxonomy.ts → classifyDeath()`:
- New input: `exitVerdict`, `exitGroupLinkagePct = dev_funded_pct + cluster_funded_pct + launch_sniper_overlap_pct`
- Rules:
  - `exitGroupLinkagePct ≥ 60` → bump `coordinated_rug` confidence to ≥ 92, mark Tier-A auto-publish
  - `exit_pattern === 'single_dump'` AND linkage to dev → `liquidity_pulled` (or new `solo_dev_dump` cause if you want a distinct ID)
  - `exit_pattern === 'sequential_burst'` AND `same_funder_pct ≥ 40` → `coordinated_rug`
  - `exit_pattern === 'slow_bleed'` AND launch_sniper_overlap → `wash_trade_exit`

### 5. Writer prompt + report template

`autopsy-writer/index.ts`:
- Pass `exit_group`, `exit_pattern`, `collapse_window`, `exit_group_linkage_summary`, `exit_verdict` into the user prompt.
- Add a **mandatory new section** to the markdown template: **"The Exit Group — Who Actually Pulled the Plug"**. Required content:
  - One-line verdict ("Pre-planned exit by 4 wallets, all funded by KYC root `Abc…XyZ`").
  - Table of top exit wallets with: short addr, SOL extracted, % of dump, acquisition mode, funder, linkage tags.
  - Timeline narrative tying collapse window to launch tx.
  - Explicit "Where the plan started" paragraph: traces back from exit → acquisition → funder → KYC.
- If `exit_verdict === 'insufficient_data'`, the section must say so explicitly (no fabrication) and add an entry to `evidence_gaps`.

### 6. Re-run for AstroGrok

After deploy, re-trigger AstroGrok via the queue's "Re-run Autopsy" button (`holders-intel-autopsy-now { force: true }`) to validate the new Exit Group section surfaces the wallets you flagged.

## Out of scope (this round)

- UI rendering changes on `/autopsies/<slug>` — the new markdown section will render via the existing `ArticleMarkdownRenderer`. No reader-page work needed.
- No changes to `holders-intel-poster` / `ManualXPostingQueue` — the X tweet's "Autopsy Now" CTA already pulls the regenerated report and banner.
- No new DEX integrations — we use Helius pair sigs + the existing DexScreener cache only.

## Files touched

- **New**: `supabase/functions/_shared/autopsy-exit-group.ts`
- **New migration**: adds 5 columns to `autopsy_tx_evidence`
- **Edited**: `supabase/functions/autopsy-tx-timeline/index.ts` (call + persist)
- **Edited**: `supabase/functions/_shared/autopsy-taxonomy.ts` (new signals + rules)
- **Edited**: `supabase/functions/autopsy-writer/index.ts` (prompt + template)
