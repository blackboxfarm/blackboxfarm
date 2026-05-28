## Goal
Kill retries by making rows ineligible until they're actually ready to post. Plus build the template library, show_url safe zone, settings table, and logging.

## A. Prevent failures (no more retry loop)

**`no-lube-orchestrate` candidate selection rewrite**
Replace current "pick anything not posted" with a strict eligibility view. Row is eligible ONLY when ALL true:
- `entry_market_cap IS NOT NULL AND entry_market_cap > 0`
- `creator_status = 'resolved'`
- `dev_wallet_resolved_at IS NOT NULL`
- `mesh_hydrated_at IS NOT NULL`
- Live DexScreener mcap available + fresh (≤5 min) AND > 0
- Not already in `no_lube_post_log` for this profile_kind
- Not `terminal_dead`

If no row passes → orchestrator exits clean ("no eligible candidates"), no error, no retry, no log spam. Next tick re-evaluates. Failed posts become impossible because we never attempt one that isn't ready.

**`insiders-lifecycle-builder` hard-reject**
If a parsed Telegram message lacks entry_mcap or mint, do NOT insert a partial row. Log to a new `insiders_parse_failures` table for review. No half-baked rows enter the pipeline.

**Single Telegram retry only**
Compose-card → Telegram send: one immediate retry on HTTP 5xx (Telegram's side), then give up cleanly and mark the post `failed_external`. No re-queue loop.

## B. Template library + active-template selector (Q3)

**Table `no_lube_channel_settings`**
- `profile_kind` (public | private) PK
- `active_template_id` → templates
- `rotation_mode` ('sticky' | 'random' | 'round_robin') default 'sticky'
- `last_used_template_id` (round_robin bookkeeping)
- GRANTs + RLS (admin-only writes, service_role full)

**Compositor `no-lube-compose-card`**
Replace `is_default=true` lookup with: read settings row → pick template per rotation_mode → record `selection_reason` on `no_lube_card_renders`.

**UI** in `NoLubeTemplateManager`
- On Public + Private tabs add "Active background" dropdown listing enabled templates for that kind/lang.
- Rotation-mode selector (sticky / random / round-robin).
- Upload/CRUD stays — new PNGs auto-appear in the dropdown.

## C. show_url safe zone (Q4)

- Add `show_url` to default safe-zones JSON seed (suggested `{x:30, y:600, w:964, h:28}`).
- Compositor renders channel handle/URL text into `show_url` if present.
- Templates tab overlay preview renders the box.
- Migration backfills existing template rows with the new key + default coords.

## D. Migration files (Q5)

1. `no_lube_channel_settings` table + GRANTs + RLS + seed rows for `public`/`private` pointing at current default template.
2. JSON backfill: add `show_url` to every existing `no_lube_card_templates.safe_zones`.
3. New `insiders_parse_failures` table for hard-reject debugging.
4. New column `no_lube_card_renders.selection_reason TEXT`.

## E. Edge-function logging (Q6)

- `no-lube-compose-card`: log `template_id`, `rotation_mode`, `selection_reason` on every render.
- `no-lube-orchestrate`: log eligibility-filter counts each tick (`eligible: N, blocked_missing_mcap: X, blocked_no_creator: Y, blocked_stale_price: Z`). This makes "why nothing posted" answerable in 5 seconds.
- All writes wrapped in `assertUpdate`/`assertInsert`.

## F. Cron cadence

Recommend `insiders-pipeline-orchestrator-15m` → **5 min**. Genealogy step is cooldown-guarded so cost is negligible. Lifecycle-builder stays at 2 min.

## Out of scope
- Heartbeat alerts
- AI character-swap pass

Awaiting **Plan Approved**.