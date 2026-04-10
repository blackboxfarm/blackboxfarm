

# What's Next: 4 Remaining Deficits

## Current State After Backfill

The backfill crushed Deficit #1 — dev profiles went from 98.3% default scores to 71% real scores (40,796 scored, 17,463 with rug counts). That was the biggest credibility gap and it's fixed.

Here's what remains:

| # | Deficit | Current State | Impact |
|---|---------|---------------|--------|
| 2 | `token_social_links` empty | **0 rows** | `/dev` social doxxing shows nothing; mesh data exists but isn't surfaced through this table |
| 3 | Token assessments thin | **12 total, 0 deaths** — vigil hasn't run since March 19 (3 weeks stale) | AI training loop has no death data; pattern matcher works off 12 records |
| 4 | `holders_intel_seen_tokens` thin | **1,278 tokens** vs 65K+ tracked | Curated intelligence <2% coverage |
| 5 | `/ca` and `/quick` identical | Both call same function, return same 3 fields (holders, health, top10%) | Paying users see no differentiation |

## Recommended Priority Order

### Priority 1: Restart Token Vigil (Deficit #3)
**Why first**: The vigil is completely stalled — last scan was March 19. Zero death assessments means the AI training loop has no negative examples to learn from. This is the foundation for predictive intelligence.

**What to do**:
- The vigil only has 9 tokens and only 33 are eligible for seeding (tokens seen in last 24h with >$5K mcap in `token_lifecycle`). The seeding query is too narrow
- Widen the seeding criteria to pull from `scraped_tokens` or `holders_intel_seen_tokens` (1,278 tokens) — not just `token_lifecycle`
- Add a manual "seed vigil" admin button to bulk-load tokens from the top-200 scraper
- Verify the orchestrator cron is actually invoking `token-vigil` (no edge function logs found)

### Priority 2: Backfill `token_social_links` (Deficit #2)
**Why second**: The `backfill-x-communities` function already writes to this table (line 108) and the mesh has 61K X accounts and 157K wallets. The pipeline exists but the table is empty, meaning the backfill function either isn't running or is failing silently.

**What to do**:
- Check `backfill-x-communities` logs to see if it's running and why it's inserting 0 rows
- Run a one-time migration to populate `token_social_links` from existing `reputation_mesh` data (X accounts, Telegram groups already stored there)
- Create a `social-links-backfill` edge function similar to the reputation backfill — batch-extract social data from mesh into `token_social_links`

### Priority 3: Differentiate `/ca` vs `/quick` (Deficit #5)
**Why third**: Quick win, high user-facing impact. Both commands are literally the same 3 data points with slightly different emoji headers.

**What to do**:
- Make `/quick` the lightweight command it claims to be: holders + mcap + phase only (no edge function call — just DB lookup from `token_lifecycle`)
- Make `/ca` the richer snapshot: add dev reputation score (now real data!), social links count, risk flags, and a mini risk bar
- This creates a clear upgrade path: `/quick` (instant, DB only) → `/ca` (richer, calls report) → `/holders` (full breakdown)

### Priority 4: Grow `holders_intel_seen_tokens` (Deficit #4)
**Why last**: This is an organic growth problem — the table fills as users scan tokens. The real fix is making the other commands (`/quick`, `/ca`, `/holders`) automatically upsert into this table when they process a token, creating a flywheel effect.

**What to do**:
- Add upsert logic to the `bagless-holders-report` function: every token scanned gets a row in `holders_intel_seen_tokens`
- This turns every user scan into a data contribution — the table grows with usage

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/token-vigil/index.ts` | Widen seeding query, add alternate data sources |
| `supabase/functions/social-links-backfill/index.ts` | **New** — batch extract socials from mesh → `token_social_links` |
| `supabase/functions/holdersintel-bot-webhook/index.ts` | Differentiate `/ca` vs `/quick` handlers |
| `supabase/functions/bagless-holders-report/index.ts` | Add upsert to `holders_intel_seen_tokens` on every scan |
| `src/components/admin/tabs/UtilitiesTab.tsx` | Add social links backfill button + vigil status card |

## API Cost

- Priorities 1, 2, 4: **$0** — internal DB operations only
- Priority 3: **$0** — code change only, `/quick` becomes cheaper (no edge function call)
- Token vigil ongoing: Uses DexScreener free API (rate-limited, already handled with 300ms delay)

