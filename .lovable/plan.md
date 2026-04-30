## Plan v2 — UNCRAFT-class autopsies, locked in

Confirmed: keep `natural_cycle`, ship the TG join button, allow re-generate as replacement, and weave **dev reputation + wallet-cluster history** into every classification and narrative.

---

## 1. Death taxonomy: add `natural_cycle` (Tier-C, organic)

In `supabase/functions/_shared/autopsy-taxonomy.ts`:

| Field | Value |
|---|---|
| id | `natural_cycle` |
| label | Natural Cycle |
| intent | `organic` |
| tier | C |
| verdict | **RAN ITS CYCLE** (explicit non-failure) |
| summary | Project shipped a real social stack, peaked legitimately, retail rotated out. No malice, no abandonment. |
| signals | `ath_mcap_usd>=100000`, `social_completeness>=3`, `holders_at_ath>=500`, `no_malicious_dump`, `dev_holding_pct>=5` |
| autoPublishMinConfidence | 999 (manual review only) |

`classifyDeath()` gets a new top-of-organic branch — checked **before** `hype_decay` / `community_burnout` / `organic_death`. The existing organic causes only fire when social completeness is LOW (so well-built projects never get "organic death" or "failed launch" labels again).

`hype_decay` / `community_burnout` get re-tuned to require `social_completeness < 3`.

---

## 2. Candidate evidence enrichment (the empty-row fix)

The UNCRAFT row had every metric NULL — that's why the AI said "dead on arrival." Migration adds these columns to `autopsy_candidates`:

| Column | Source |
|---|---|
| `social_completeness` (0–6) | Distinct platforms in `token_social_links` (website, x, x_community, telegram, discord, youtube) |
| `x_community_member_count` | `x_community_resolution_queue` + Apify scrape |
| `x_community_mod_count`, `x_community_admin_count` | Apify community About page |
| `telegram_subscriber_count` | `telegram_channel_registry` if linked, else `getChat` if bot is member |
| `discord_present` | bool from socials |
| `youtube_url` | from socials |
| `boosts_paid_usd` | sum from `boost_entries` matched by mint or X handle |
| `dex_paid` | bool from `dex-paid-checker` |
| `holders_at_ath` | `holder_daily_summary` snapshot near ATH |
| `dev_holding_pct_at_death` | `dev_behavior_scores` |

New shared helper `supabase/functions/_shared/autopsy-enrich.ts` populates these from existing tables + on-demand calls. Wired into `autopsy-funnel-feeder` (every insert/upsert) and `autopsy-social-death-check` (refresh during social pass).

**Backfill SQL:** one-shot UPDATE recomputes `social_completeness` for every existing candidate.

---

## 3. Dev reputation context — the "prime suspect" overlay

Currently `autopsy-writer` reads `dev_behavior_scores` and `dev_wallet_reputation` for the immediate creator wallet only. Expand the evidence pull:

### 3a. New shared helper `_shared/autopsy-dev-context.ts`
For each candidate's `creator_wallet`:

1. **Direct reputation** — `dev_wallet_reputation`, `dev_behavior_scores` (existing).
2. **Prior tokens by same wallet** — query `pumpfun_watchlist` + `token_lifecycle` by `creator_wallet`. Tally: total launched, dead, rug-classified, last 5 with mcap + outcome.
3. **KYC root + linked wallets** — pull `dev_genealogy_traces` / `wallet_family_clusters` (or whatever your existing source is, mapped via the Dev Genealogy memory). Get the cluster size, KYC root, and sibling wallets.
4. **Cross-cluster history** — for each sibling wallet in the cluster, repeat step 2. This catches the "4th project, 3 prior linked-wallet bleeds" case explicitly.
5. **Allstar / blacklist flags** — `allstar_mint_alerts`, any blacklist tables.

Returns a structured `DevDossier`:
```ts
{
  wallet, kyc_root, cluster_wallets[],
  prior_tokens: { wallet, mint, ath, status, death_cause }[],
  cluster_history_summary: {
    total_prior_tokens, dead_count, rug_count, soft_rug_count,
    natural_cycle_count, allstar_count
  },
  reputation_verdict: 'clean' | 'mixed' | 'repeat_offender' | 'serial_rugger',
  primary_evidence_strings: string[]   // ready-made sentences for the .md
}
```

### 3b. Classifier weighting
`classifyDeath()` accepts a new optional `devDossier` arg. Rules:

- `serial_rugger` (3+ prior rugs/soft-rugs in cluster) → bumps any matching cause +15 confidence and **forces minimum cause = `slow_bleed_dump`** even when on-chain dump pattern looks gentle. This is the "bled out by linked wallets even with no direct bundle to KYC" case.
- `repeat_offender` (2 prior dead tokens in cluster) → +10 confidence, never downgrades a malicious cause to organic.
- `clean` + `social_completeness >= 3` + `ath >= $100k` → eligible for `natural_cycle`.
- `allstar_count >= 1` and no malicious signals → strongly favors `natural_cycle` regardless of mcap.

### 3c. Writer prompt section
Inject a new mandatory `## DEV DOSSIER` block in the user prompt with the dossier serialized. System prompt gains:

> If `cluster_history_summary.rug_count + soft_rug_count >= 3`, the report MUST name this as a repeat-pattern actor in §5 (Fingerprint) and §6 (Verdict), even when the immediate on-chain footprint is ambiguous. Cite the prior mints by ticker + ATH.

---

## 4. Branched writer prompt + few-shot

System prompt picks one of three reference shapes by `intent`:

- **malicious** → existing GPT few-shot.
- **negligent** → trimmed GPT shape with "Failure Mechanic" section.
- **organic / `natural_cycle`** → new "Honest Run" few-shot:
  - Verdict: **RAN ITS CYCLE — No malice detected.**
  - §2 Players credits the dev's social build-out (X community size, mods/admins, TG subs, Discord, YouTube, CMC, paid boosts).
  - §3 **What They Did Right** (replaces "Rug Mechanic").
  - §4 **Cycle Anatomy** (legitimate peak + natural retail rotation).
  - §5 Fingerprint shows clean dev dossier or notes the rotation pattern.
  - §6 closes: "Project completed its on-chain lifecycle. No reputational flag."

**Hard banned phrases when `social_completeness >= 3`:** "on-chain ghost", "dead on arrival", "failed launch", "no community", "abandoned token creation attempt." Enforced both in system prompt and as a post-generation regex check that fails the draft if violated.

---

## 5. Re-generate as replacement (loop until you're happy)

Schema:
- `autopsy_reports` gets `version int default 1` + `is_current bool default true`.
- `autopsy_reports` unique index on `(slug)` is replaced with `(slug, version)`.

UI (`AllDrafts.tsx`):
- Once a row has a draft, the "Generate Report" button becomes **"Re-generate (replace)"** in a different colour (amber) instead of being disabled.
- Status badge changes from `Drafted` → `Drafted v2`, `Drafted v3`, …
- "Approve & Publish" approves the **current** version. Older versions stay in DB (history) but `is_current = false`.

Edge function `autopsy-writer` accepts `regenerate: true` in body:
- Marks prior `autopsy_reports` row(s) for this `candidate_id` as `is_current = false`.
- Inserts a new row with `version = max+1`, `is_current = true`.
- Re-runs banner overlay (best-effort).
- Resets candidate `status` to `drafted`, `decided_at = null`.

Public render reads `is_current = true` only.

---

## 6. Manual TG join button (sentry-bot situations)

UI in each Drafts row: a **"Open TG"** link (uses `token_social_links` telegram URL) + a **"I'm in — deep scrape"** button.

New edge function `autopsy-tg-deep-pull` (Telegram Bot API via gateway):
- `getChat` → member count, title, description, pinned message.
- `getChatAdministrators` → admin/mod list.
- `getChatHistory` (where allowed) — last 50 messages, last admin message timestamp, spam %.

Stores raw output in new `autopsy_evidence_blobs` table (`candidate_id, kind='tg_deep_pull', payload jsonb, captured_at`).

`autopsy-writer` reads any blob with `kind in ('tg_deep_pull','x_community_scrape')` for the candidate and feeds it verbatim into the prompt under `## SOCIAL EVIDENCE BLOBS`. Re-generate after joining picks up the new blob automatically.

---

## 7. UNCRAFT specifically — the test case

After deploy:
1. Reset `2pFFgMtw...pump` candidate to `pending`, mark current `autopsy_reports` row `is_current=false`.
2. Run `autopsy-funnel-feeder` single-mint mode → fills enrichment columns (social_completeness should hit 4–5: website, X, X-community, TG, +Discord/YouTube).
3. (Optional) Click "Open TG" → join → "I'm in — deep scrape".
4. Click "Re-generate" on the draft.

Expected output: verdict `RAN ITS CYCLE`, intent `organic`, narrative crediting the 2,400-member X community, 386 TG subs, Discord, 500x DexScreener boost, CMC submission. Banned phrases gone. Dev dossier shows clean.

---

## Files touched

**Edge functions / shared**
- `supabase/functions/_shared/autopsy-taxonomy.ts` — add `natural_cycle`, re-tune organic branches, accept `DevDossier` arg.
- `supabase/functions/_shared/autopsy-enrich.ts` *(new)* — fill 10 enrichment columns.
- `supabase/functions/_shared/autopsy-dev-context.ts` *(new)* — build `DevDossier` from cluster + prior tokens.
- `supabase/functions/autopsy-funnel-feeder/index.ts` — call enrich on every insert.
- `supabase/functions/autopsy-social-death-check/index.ts` — refresh enrichment + member counts.
- `supabase/functions/autopsy-writer/index.ts` — branched system prompt, dev dossier block, regenerate path, banned-phrase regex guard, version bump.
- `supabase/functions/autopsy-tg-deep-pull/index.ts` *(new)* — Telegram gateway calls + blob insert.

**UI**
- `src/components/admin/autopsies/AllDrafts.tsx` — Re-generate button (amber), version badge, "Open TG" link, "I'm in — deep scrape" button.
- `src/components/admin/autopsies/CoolDeathsBacklog.tsx`, `LiveDeathWatch.tsx` — surface version in lock state.
- `src/pages/AutopsyArticle.tsx` — query `is_current = true`.

**Schema migration**
- New columns on `autopsy_candidates` (10 enrichment fields).
- New columns on `autopsy_reports`: `version int`, `is_current bool`. Replace unique index.
- New table `autopsy_evidence_blobs(id, candidate_id, kind, payload jsonb, captured_at, created_by)`.
- Backfill SQL: recompute `social_completeness` for existing candidates; mark all current reports `is_current=true, version=1`.

**Memory**
- `mem/features/autopsy/pipeline-protocol.md` — add `natural_cycle`, dev-dossier weighting, re-generate flow, TG deep-pull, banned-phrase rule.

---

## Open questions

1. **Cluster source of truth** — which existing table is canonical for "wallets in same cluster as creator"? Candidates I see: `dev_genealogy_traces`, `wallet_family_clusters`, the v_dev_social_graph view. Should I pick the one with the highest coverage and document it in the dev-context helper, or do you want me to ask before wiring?
2. **TG deep-pull permissions** — confirm we want to read message history, not just `getChat` metadata. History requires the bot to be a member with history-visible. OK to ship the button assuming you'll join manually first?
3. **Should the re-generate button cap at e.g. 5 versions** to keep DB clean, or unlimited?