
# Vulture Detection v1 — X Community Phishing Sweep

## Concept (your words, codified)

A "Vulture" = an X account that posts in a dying/dead token's X Community trying to lure leftover holders to fake pump.fun live streams or lookalike domains (e.g. `pumpem.fun`, ASCII-spoofed URLs) to phish wallet creds. We want to:

1. Scrape the autopsied token's X Community feed.
2. AI-classify each post → benign / vulture / mod / dev.
3. Record every Vulture handle as a Bad Actor with reason `phishing_vulture` + the scam vector (`fake_live_pumpfun`, `lookalike_domain`, etc.).
4. Surface counts and a public warning in the autopsy report.
5. Also flag "no moderator deletions" → community is abandoned.
6. Make the scraper independently callable for future ad-hoc audits (not just at autopsy time).

This is "Vulture Type 1: Fake-Live Pump.fun Phishing." Future types (TG CTO scams, etc.) plug into the same `vulture_kind` enum.

## What already exists (reuse, don't rebuild)

- `x-community-enricher` resolves a community → name, member_count, admins.
- `apidojo~tweet-scraper` is already used in `x-pinned-community-finder` with `startUrls: [{ url: ... }]` shape.
- `autopsy-evidence-interpret` runs Gemini over evidence blobs and writes `kind='ai_interpretation'`.
- `autopsy_evidence_blobs` table already takes per-candidate blobs by `kind`.
- `AllDrafts.tsx` already shows badges per candidate; `AutopsyArticle.tsx` renders the report sections.

We extend, we do not duplicate.

## New pieces

### 1. DB — `vulture_accounts` + per-token sightings + URL lookalike list

```text
vulture_accounts                    one row per X handle ever flagged
  handle                  text PK
  display_name            text
  first_seen_at           timestamptz
  last_seen_at            timestamptz
  total_sightings         int
  vulture_kinds           text[]    e.g. {fake_live_pumpfun}
  confidence_avg          int       0-100
  is_likely_bot           bool
  notes                   text

vulture_sightings                   one row per (token, handle, post)
  id                      uuid PK
  token_mint              text
  candidate_id            uuid
  community_id            text
  handle                  text  -> vulture_accounts.handle
  post_url                text
  post_text               text
  posted_at               timestamptz
  vulture_kind            text   fake_live_pumpfun | lookalike_domain
                                 | wallet_drainer_link | unknown
  scam_urls               text[] extracted lookalike/phishing URLs
  ai_confidence           int
  ai_reason               text
  captured_at             timestamptz default now()

vulture_lookalike_domains          curated + auto-grown deny-list
  domain                  text PK   pumpem.fun, pump-fun.app, etc.
  kind                    text       lookalike | confusable_unicode | known_drainer
  added_by                text
  added_at                timestamptz
```

Seeded with: `pumpem.fun`, `pump-fun.app`, `pump.fun.live`, plus a unicode-confusable check (`p`/`р`, `u`/`υ`, etc.) computed at scan time, not stored.

### 2. Edge function — `autopsy-vulture-sweep` (new)

Input: `{ candidate_id?, token_mint?, community_id?, force? }` (any of candidate/token resolves the community).

Steps:
1. Resolve the X Community ID from `token_social_links` (already populated by enricher).
2. Call `apidojo~tweet-scraper` with `startUrls: [{ url: 'https://x.com/i/communities/{id}' }]`, `maxItems: 80`, `sort: 'Latest'`. (Same actor + shape that `x-pinned-community-finder` already uses successfully.)
3. For each tweet: extract author handle, text, t.co-expanded URLs, posted_at.
4. **Pre-filter (cheap, no AI):** flag a post if any of:
   - URL host matches `vulture_lookalike_domains`
   - URL host is a unicode-confusable of `pump.fun`
   - Text matches `/dev (is )?live|going live|live now/i` AND contains a non-`pump.fun` link or a CA
   - Same exact text posted by ≥3 different handles in the feed (bot copypasta)
5. **AI classify** flagged + a sample of unflagged posts via Lovable AI Gateway (Gemini Flash) using a strict JSON schema:
   ```json
   { "posts": [{ "handle":"", "vulture_kind":"fake_live_pumpfun|lookalike_domain|wallet_drainer_link|benign|mod|dev",
                 "confidence":0-100, "reason":"", "scam_urls":[] }] }
   ```
   System prompt includes the lookalike-domain list and the "fake live stream" pattern.
6. Write each non-benign post → `vulture_sightings`; upsert handle into `vulture_accounts` (increment counters, union kinds).
7. Compute summary `{ vulture_count, vulture_handles[], scam_urls[], copypasta_groups, mod_activity_seen, sampled_posts }` and store as an `autopsy_evidence_blobs` row with `kind='vulture_sweep'` (so `autopsy-writer` can read it the same way it reads boosts).
8. Also queue these handles into existing bad-actor pipelines if a `social_bad_actors` / `dev_behavior_scores` analogue exists for X handles — otherwise `vulture_accounts` stands alone for v1.

### 3. Wiring — autopsy pipeline

- `autopsy-enrich.ts`: read the latest `vulture_sweep` blob and surface
  `{ vulture_count, vulture_handles, scam_urls, mod_activity_seen, sampled_posts[5] }` to the writer.
- `autopsy-writer/index.ts`: pass that into the prompt and add a new mandatory report section **"Vultures & Phishing Activity"** with:
  - Public warning: "Do not click links posted in this community. {N} accounts are spamming fake pump.fun live-stream phishing posts."
  - Bullet list of handles with kind + confidence.
  - Lookalike domains observed.
  - "Mods active? yes/no" (flips to a "community abandoned" line if no).
- Pipeline order: `autopsy-vulture-sweep` runs **before** `autopsy-evidence-interpret`, so the AI interpreter sees vulture context too.

### 4. UI — admin + public

**`AllDrafts.tsx`**: add a Vulture badge (Skull-ish icon) showing `{vulture_count}` per candidate; click → opens a side panel listing handles, post snippets, scam URLs, with a "Re-sweep" button (calls `autopsy-vulture-sweep` with `force:true`). Aligns with your earlier rule that re-generate buttons change colour/state after first run.

**`AutopsyArticle.tsx`**: render the new "Vultures & Phishing Activity" section with a red warning banner above it, the handle list, and a "Why this matters" 1-liner about wallet-drainer scams.

**Independent tool**: a tiny admin page button "Sweep any X Community" that takes a community URL/ID and runs the same edge function without an autopsy candidate. Stores results to `vulture_sightings` with `candidate_id=null`. Satisfies your "independently called assessment tool" requirement.

### 5. Future-proofing for Vulture Types 2..N

`vulture_kind` is an open text field, not a tight enum, so adding "tg_cto_scam", "fake_mod", "shill_bundle" later only needs a system-prompt update and (optionally) new pre-filter rules. The tables, UI, and report section don't change.

## Open questions before I build

1. **Sweep timing** — sweep automatically when a candidate moves to status=`drafted`, or only on first report generation + manual re-sweep? (Apify cost: ~1 actor run per autopsy.)
2. **Public visibility** — show vulture handles publicly in the report, or admin-only with just the count + warning shown publicly? (Defamation risk vs. public-good warning.)
3. **Bot heuristic threshold** — call a handle `is_likely_bot=true` after how many cross-token sightings? Default: ≥3 different tokens in 30 days.

## Files to create / edit

Create:
- `supabase/migrations/<ts>_vulture_detection.sql` (3 tables + seed lookalike list)
- `supabase/functions/autopsy-vulture-sweep/index.ts`
- `supabase/functions/_shared/vulture-classify.ts` (pre-filter + AI prompt builder)
- `src/components/admin/autopsies/VulturePanel.tsx` (side panel + re-sweep)
- `src/components/admin/CommunitySweepTool.tsx` (independent admin tool)

Edit:
- `supabase/functions/_shared/autopsy-enrich.ts` (read vulture_sweep blob)
- `supabase/functions/autopsy-writer/index.ts` (new report section + prompt)
- `src/components/admin/autopsies/AllDrafts.tsx` (Vulture badge + panel trigger)
- `src/pages/AutopsyArticle.tsx` (render new section + warning banner)
