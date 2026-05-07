## Diagnosis — why the AstroGrok autopsy looks wrong

I read the actual pipeline (`autopsy-writer`, `autopsy-tx-timeline`, `autopsy-social-death-check`, `autopsy-dev-context`, `autopsy-evidence-interpret`) against your screenshots. The verdict "natural decline / clean dev" is wrong for at least four concrete reasons that are all **fixable code/data gaps**, not AI judgement calls:

### Gap 1 — Co-snipers are captured, but never traced back to the dev
`autopsy-tx-timeline.decodeLaunchTx()` already records every wallet that bought tokens **in the same tx as the dev** (`co_snipers[]` with `pct_of_curve`). But nothing then asks: *"were those wallets funded by the dev / KYC root / a sibling?"* So a 4-wallet sniper bundle owned by the dev shows up in the report as "anonymous early buyers" and the writer concludes "no malicious dump."

### Gap 2 — KYC root resolution is too shallow
`buildDevDossier` only checks `wallet_family_members` + a single-hop `developer_genealogy` lookup. If the dev wallet was never seeded into `wallet_family_members` (which happens for fresh pump.fun mints), it returns `kyc_root: null` and the report renders ❌ for the KYC row — even when the dev's funder is sitting on Solscan one hop away. There's also a $3K pump.fun profile balance sitting on `GxpEYC…F2ee` that is itself a strong KYC signal we never surface.

### Gap 3 — "Suspended" X account is invisible to the writer
`autopsy-social-death-check` only computes `social_no_admin_hours`/`social_spam_pct`. It never flags **HTTP 404 / "Account suspended"** on the X handle. The writer sees a present `twitter` link and says "the dev built socials" — when in reality the account is now suspended (which is itself a death signal worth a full paragraph).

### Gap 4 — Failed scrapes are silently swallowed
`autopsy-evidence-interpret`, the X community sweep, and the TG deep-pull all `try/catch { /* ignore */ }`. When Apify/Browserless returns 0 results, the writer never knows the difference between "we looked and found nothing" vs "we couldn't look." The report should explicitly say *"Telegram scrape failed — verdict made without Telegram evidence."*

---

## Plan

### 1. New shared helper — `traceClusterDump`
Create `supabase/functions/_shared/autopsy-cluster-dump.ts`:

- Input: `txEvidence.co_snipers[]` + dev wallet + KYC root.
- For each sniper wallet: call `discoverFunding()` (already exists in `_shared/funding-resolver.ts`) to find its first-inbound funder.
- Bucket results into:
  - `dev_funded` — funder == dev OR == KYC root
  - `cluster_funded` — funder ∈ `dossier.cluster_wallets`
  - `same_funder` — multiple snipers share an upstream funder (≤ 2 hops)
  - `cex_funded` — funder is in `cex-wallets.ts` registry
  - `unknown`
- Return `{ snipers_with_provenance: [...], cluster_capture_pct: number, verdict: 'coordinated_bundle' | 'mixed' | 'organic' }`.
- Persist as a new `autopsy_evidence_blobs` row `kind='cluster_dump_provenance'` and as `autopsy_tx_evidence.cluster_dump_provenance` (new column).

### 2. Migration
Add to `autopsy_tx_evidence`:
- `cluster_dump_provenance jsonb`
- `cluster_capture_pct numeric`
- `cluster_dump_verdict text`

Add to `autopsy_candidates`:
- `social_x_account_status text` (`active` | `suspended` | `not_found` | `private` | `unchecked`)
- `social_x_checked_at timestamptz`
- `evidence_gaps jsonb` — array of `{ source, reason }` strings the writer must surface.

### 3. Harden `autopsy-tx-timeline`
After `decodeLaunchTx` returns co_snipers, immediately call `traceClusterDump` and write the provenance fields. This runs once, in the same edge function, so cost is bounded (≤ 5 extra Helius calls per autopsy).

### 4. New edge function `autopsy-x-status-check` (or extend `autopsy-social-death-check`)
- For every X handle on `token_social_links`, do a **server-side fetch** of `https://x.com/<handle>` via Browserless (existing connector) and look for the "Account suspended" / "doesn't exist" markers.
- Write `social_x_account_status` + timestamp on `autopsy_candidates`.
- Run inside `autopsy-writer` before the prompt is built, so the writer can cite it.

### 5. Strengthen KYC resolution in `buildDevDossier`
Three additions, in order:
1. If `wallet_family_members` returns nothing, **directly call `discoverFunding(creatorWallet)`** and treat the funder as the KYC candidate when it isn't a known DEX/router/jito tip account.
2. If the funder is in the CEX registry, set `kyc_root = funder` and tag `kyc_source = 'cex_<exchange>'`.
3. Trigger `wallet-family-discovery` (existing) for the dev wallet on-demand when missing, so the next autopsy on the same dev gets the cluster.

Also: the pump.fun profile balance ($3K SOL on the dev) should be surfaced as a `dev_realized_value_usd` field on the dossier — that IS the smoking gun for "they kept the money."

### 6. Make scrape failures loud, not silent
Replace every `try { … } catch { /* ignore */ }` in the autopsy pipeline with `try { … } catch (e) { evidenceGaps.push({ source: 'tg_deep_pull', reason: e.message }) }`. Pass `evidence_gaps` into the writer prompt and add a **mandatory "Evidence Gaps" section** to the markdown template — so the report says explicitly *"Telegram could not be scraped; verdict excludes TG signals."* This stops false-confidence verdicts.

### 7. Re-classify in `_shared/autopsy-taxonomy.ts`
Add new signals to `classifyDeath`:
- `clusterCapturePct` (from step 1) — `> 35%` → `coordinated_rug` confidence boost.
- `xAccountSuspended` boolean — adds confidence to `coordinated_rug` / `marketing_scam`.
- `devRealizedValueUsd` — when dev wallet still holds > $1K SOL after death and ATH > $500K, this is a strong "they cashed out" indicator.

### 8. Re-run AstroGrok and confirm
Once the above ships, run `holders-intel-autopsy-now` for the AstroGrok queue row with `force: true`. The report should now show:
- Discovery Snapshot: KYC ✅ (funder of `GxpEYC…`)
- Players section: cluster of N sniper wallets all funded by dev
- Verdict: coordinated bundle, X account suspended, $3K still in dev wallet
- Explicit "Evidence Gaps" section listing TG/Discord absences as "not present" vs "scrape failed."

---

## Build order

1. Migration (3 columns on `autopsy_tx_evidence`, 3 on `autopsy_candidates`).
2. `_shared/autopsy-cluster-dump.ts` + wire into `autopsy-tx-timeline`.
3. KYC resolution hardening in `_shared/autopsy-dev-context.ts` (incl. funder fallback + pump.fun balance read).
4. `autopsy-x-status-check` edge function + invoke from `autopsy-writer`.
5. `evidence_gaps` plumbing across pipeline + new "Evidence Gaps" markdown section in `autopsy-writer`.
6. Taxonomy signals in `_shared/autopsy-taxonomy.ts`.
7. Re-run AstroGrok via `holders-intel-autopsy-now { queue_id, force: true }`.

## Out of scope

- No changes to `holders-intel-poster`, `ManualXPostingQueue.tsx`, or the autopsy banner overlay.
- No changes to the public `/autopsies/<slug>` reader page — markdown additions render automatically.
- We are NOT auto-publishing to X. Manual queue stays manual.
