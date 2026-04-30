## Autopsy Queue — Feedback + Improvement Plan

### Why every row is Tier-B `failed_launch` (the real answer)

I checked the DB directly. All 200 candidates are:
- `source_feed = pumpfun_watchlist`
- `death_cause = failed_launch`
- `tier = B`

Two reasons no Tier-A or C is showing:

1. **Tier-A requires malicious signals** (dev_buy_pct, dump_velocity, lp_pull_score, freeze_authority, pre-launch funding). Those come from `dev_behavior_scores` joined on `creator_wallet`. Pump.fun watchlist rows often have no creator wallet stored, so the classifier falls through to `failed_launch` every time.
2. **Tier-C is intentionally suppressed** — funnel drops Tier-C with ATH < $10k as "too noisy", and pump.fun dead tokens get auto-promoted from C to B.

So the funnel is *working*, but it's only being fed by one source (pump.fun dead list) and it's missing the malicious-signal join. That's a separate fix from the UI polish below — flagged at the end.

---

### UI changes to `src/pages/admin/AutopsyQueue.tsx` and `src/components/admin/autopsies/AutopsyQueueBody.tsx`

Both files are near-duplicates. I'll factor the row into a shared component so we change it once.

#### 1. Human-readable age
Replace `${c.age_hours.toFixed(0)}h old` with a smart formatter:
- `< 1h` → `42m old`
- `< 24h` → `7h 12m old`
- `< 7d` → `2d 14h old`
- `>= 7d` → `3w 2d old`

#### 2. Full token address + DexScreener link
Replace the truncated `AaShE6et…pump` with the full mint, monospace, clickable, opens `https://dexscreener.com/solana/{mint}` in a new tab. Add a small copy-to-clipboard icon next to it.

#### 3. Ordinal numbering
Add a `#1`, `#2`, … prefix on each row reflecting current sort position.

#### 4. Sorting controls
Add a sort dropdown above the list with these options:
- Score (default, current behavior)
- Funneled at — newest / oldest
- Mint creation (age) — newest / oldest  *(uses `age_hours` ascending = newest)*
- Time of death — most recent / oldest  *(uses `analyzed_at` if set, else `funneled_at` as proxy; we don't yet store a true `died_at` — see note below)*

Sort is applied client-side after fetch; query already pulls 100 rows.

#### 5. Source-feed badge (where did this come from?)
Each row gets a small colored badge showing `source_feed` with a tooltip:
- `token_lifecycle` — "Floor sweep: mcap < $1k OR liq < $500"
- `pumpfun_watchlist` — "Curated dead list from Pump.fun watcher"
- `ath_collapsed` — "Had >$50k ATH, now <5% of peak"
- `admin_manual` — "Manually queued by admin"

So you can trace every candidate back to which intake feed surfaced it.

#### 6. Death-Cause Taxonomy modal
Add an "ℹ️ Death Causes" button in the header that opens a Dialog listing all 15 causes from `_shared/autopsy-taxonomy.ts`, grouped by intent (Malicious / Negligent / Organic), each showing:
- Label + Tier badge
- `summary` (the one-liner)
- A longer description (I'll write a `description` field per cause — detailed paragraph explaining the behavior pattern, what signals trigger it, and why it matters)
- The detection signals as monospace chips
- Auto-publish confidence threshold

Detailed descriptions will be added to `_shared/autopsy-taxonomy.ts` as a new `description` field on each cause def, so the modal data and the AI writer can both consume the same source of truth.

---

### Technical details

**Files touched (build mode):**
1. `supabase/functions/_shared/autopsy-taxonomy.ts` — add `description: string` to each `DeathCauseDef` (15 paragraphs).
2. `src/components/admin/autopsies/DeathTaxonomyModal.tsx` — new dialog component, reads a client-side mirror of the taxonomy.
3. `src/data/autopsyTaxonomy.ts` — new client-side mirror of taxonomy (we can't import edge-function code into the SPA, so duplicate the JSON-safe parts: id, label, intent, tier, summary, description, signals, autoPublishMinConfidence).
4. `src/components/admin/autopsies/AutopsyCandidateRow.tsx` — new shared row component (ordinal, full mint w/ dex link + copy, source-feed badge w/ tooltip, smart age, action buttons).
5. `src/components/admin/autopsies/AutopsyQueueBody.tsx` — use shared row, add sort dropdown + taxonomy button, manage sort state.
6. `src/pages/admin/AutopsyQueue.tsx` — same updates (or refactor to render `AutopsyQueueBody` and delete the duplicated logic — recommended).

**Sort implementation:** after `setItems(data)`, apply `sortFn` based on dropdown state. No DB changes.

**Smart age util:** small helper `formatAgeHours(h: number)` in `src/lib/utils.ts`.

---

### Note on "time of death" sort

We don't currently store a true `died_at` timestamp on `autopsy_candidates`. The proxies available are:
- `analyzed_at` — when classifier ran (close to "discovered dead")
- `funneled_at` — when row was inserted
- `pumpfun_watchlist.first_seen_at + age_hours` — not stored on candidate

For now I'll use `analyzed_at ?? funneled_at` for the "time of death" sort and label it accurately. If you want a true `died_at` we can add a column later and backfill from `pumpfun_watchlist.removed_at` / lifecycle data.

---

### Separate: why the funnel is monoculture (flag for follow-up, not in this change)

If you want Tier-A and Tier-C populated too, we need a second pass:
- Backfill `creator_wallet` on candidates from `pumpfun_watchlist.creator_wallet` and `token_lifecycle` joins so `dev_behavior_scores` can match.
- Re-run classifier on existing 200 rows after the join works → many will reclassify upward (atomic_snipe_rug, slow_bleed_dump, etc.).
- Loosen the Tier-C ATH<$10k cutoff to e.g. $2k so legit organic deaths show up.

Happy to do this in a follow-up once the UI lands. Approve this plan and I'll implement the UI changes now.
