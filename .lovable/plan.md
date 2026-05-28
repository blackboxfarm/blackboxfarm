## Two changes

### 1. Immutable Entry MC (lowest-ever lock)

**Problem:** $RAIN first-seen MC was $17.3k, the 2x post still showed Entry $17.3k / Current $48.2k, but a later post showed Current MC $45.5k with Entry "—". The system is recomputing `mcEntry` live from `Math.min(...)` of mutable sources, and `Entry` isn't actually persisted/locked anywhere — so when the sources move or drop a row, the floor changes or disappears.

**Fix:**
- Add a dedicated column `entry_mcap_usd` on `holders_intel_seen_tokens` (nullable; once set, only ratchets DOWN, never up, never to null).
- On every compose run (and on first-sight ingest), compute `candidate = min(current_mcap, existing_entry_mcap_usd, market_cap_at_discovery, historical_min_from_token_rankings)`; `UPDATE ... SET entry_mcap_usd = candidate WHERE entry_mcap_usd IS NULL OR candidate < entry_mcap_usd`.
- `{mcEntry}` in templates resolves ONLY from this column. Never recomputed at render time. This is the immutable floor.
- `{factor}` / milestone math (2x, 3.4x) uses `current_mcap / entry_mcap_usd`.

### 2. Two-tier post flow: Snapshot (fast) → Big Picture (enriched)

Rename the current enrichment-gated post to **Big Picture** and add a new **Snapshot** post that fires immediately on first sighting.

**Snapshot (Private, fires within seconds of detection):**
- Fields: ticker, CA, MC (= Entry MC), age, top10, mintable, LP burned, dev wallet (if cached), DexScreener/DexTools links.
- Gates: only DexScreener basics + dev-wallet cache lookup + bad-actor / all-star quick check. NO holders refresh, NO blackbox harvest, NO mesh hydrate required.
- If dev wallet has bad-actor flag or all-star plus → include that one line, otherwise skip.
- No image (text-only, fast).
- Template key: `no_lube_template_snapshot`.

**Big Picture (Private + Public, fires after enrichment completes):**
- The existing full template with wallet analysis, dust/whale %, BlackBox score, mesh, image composite.
- Continues to require `holders_refreshed_at`, `blackbox_harvested_at`, `mesh_hydrated_at`.
- Posted as a REPLY to the Snapshot message in Private (threaded), and standalone to Public.

**Orchestrator changes (`no-lube-orchestrate`):**
- On first sighting → enqueue Snapshot post immediately (no enrichment gate).
- After Snapshot posts → kick off enrichment pipeline as today.
- When enrichment completes → enqueue Big Picture post (Private as reply, Public as new).
- `no_lube_post_log` gets a `post_kind` column: `snapshot` | `big_picture` | `milestone`.

**Process panel:**
- New `Snapshot` column (✓ + timestamp + image flag) alongside the existing `Posted` Private/Public indicators.
- Shows the time delta between Snapshot and Big Picture so you can see enrichment lag.

### Technical details

**Migration:**
```sql
ALTER TABLE public.holders_intel_seen_tokens
  ADD COLUMN IF NOT EXISTS entry_mcap_usd numeric;

ALTER TABLE public.no_lube_post_log
  ADD COLUMN IF NOT EXISTS post_kind text NOT NULL DEFAULT 'big_picture';

-- backfill entry from existing min signals
UPDATE public.holders_intel_seen_tokens
SET entry_mcap_usd = market_cap_at_discovery
WHERE entry_mcap_usd IS NULL AND market_cap_at_discovery IS NOT NULL;
```

**Files touched:**
- `supabase/functions/no-lube-compose/index.ts` — replace live `mcEntry` calc with `entry_mcap_usd` read; add ratchet-down UPSERT before compose; branch template by `post_kind`.
- `supabase/functions/no-lube-orchestrate/index.ts` — add snapshot enqueue on first sight, remove enrichment gate for snapshot path, keep gate for big_picture.
- `supabase/functions/no-lube-push/index.ts` — stamp `post_kind`, thread big_picture as reply in Private.
- New template file or constant: `SNAPSHOT_TEMPLATE` (minimal field set).
- `src/components/social/NoLubeProcessPanel.tsx` — Snapshot column + delta display.

**Non-goals:** Not touching milestone/re-sighting logic, not changing image generation, not changing Public post timing rules.
