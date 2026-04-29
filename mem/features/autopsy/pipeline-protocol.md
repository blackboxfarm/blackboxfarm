---
name: Autopsy Pipeline Protocol
description: Full system for funneling, classifying, drafting, and tier-gating Token Autopsy reports.
type: feature
---

## BlackBox Autopsy Pipeline

**Goal:** continuously turn dead Solana tokens into forensic post-mortems that build the dev/wallet ledger.

### Death Taxonomy (v1) — `supabase/functions/_shared/autopsy-taxonomy.ts`

15 cause IDs across 4 intent buckets:
- **Malicious** (Tier-A auto-publish): coordinated_rug, atomic_snipe_rug, liquidity_pulled, honeypot, mint_authority_abuse
- **Malicious** (Tier-B queue): wash_trade_exit, slow_bleed_dump, wallet_washer
- **Negligent** (Tier-B queue): dev_abandonment, mod_abandonment, failed_launch
- **Organic** (Tier-C skip unless flagged): community_burnout, hype_decay, organic_death

`classifyDeath()` picks the most specific cause from on-chain + social signals.
`shouldAutoPublish()` only returns true for Tier-A causes meeting their `autoPublishMinConfidence`.

### Funnel sources — `autopsy-funnel-feeder` edge function

1. `token_lifecycle` floor (mcap < $1k OR liq < $500)
2. `pumpfun_watchlist` status='dead'
3. ATH-collapsed (ath_24h_usd > $50k AND current < 5% of ATH)
4. Manual admin queue (rows with `source_feed='admin_manual'`)

Tier-C candidates with ATH < $10k are **dropped** (too noisy).

### Pipeline state machine — `autopsy_candidates.status`

`pending → analyzing → drafted → (approved | rejected) → published`
`failed` is terminal.

- `autopsy-funnel-feeder`: writes `pending` rows
- `autopsy-social-death-check`: enriches `social_*` fields, may upgrade cause to mod_abandonment
- `autopsy-writer`: pulls top-scoring pending row, gathers evidence, calls Gemini with GPT autopsy as few-shot, inserts `autopsy_reports` row, marks candidate `drafted` (or `approved` if Tier-A high-conf auto-publish)

### Image overlay protocol

Banner generation follows `docs/autopsy-image-protocol.md` v2:
- Mode: image EDIT (never generate from scratch)
- Source: DexScreener `pairs[0].info.header`
- Output: `public/autopsies/<slug>-autopsy-v2.jpg`
- Decoration only — center 60% must remain identifiable

### Admin queue

`/admin/autopsy-queue` (SuperAdminRoute-gated) — review Tier-B drafts, approve/reject, manually trigger funnel + writer.

### Public rendering

- `Autopsies.tsx` merges static `AUTOPSIES` array with `autopsy_reports` DB rows (static wins on slug collision)
- `AutopsyArticle.tsx` falls back to DB lookup when slug is not in static list
- Static curated entries (e.g. GPT) keep their bespoke .md and copy

### NEVER

- Auto-publish a Tier-B or Tier-C autopsy without admin approval
- Fabricate addresses, tx hashes, or numbers in the .md (system prompt forbids)
- Replace center artwork in the banner overlay (decorate only)