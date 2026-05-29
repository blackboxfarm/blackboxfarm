# Plan: Demo post + ordering + multiplier audit

## 1. Demo Big Picture post → Private (luna_dusk_Private)

- Pick a real recently-ingested token that has full enrichment (mesh + holders complete) so the demo renders with real data, not placeholders.
- Call `no-lube-compose` with `template_key = luna_dusk_Private`, `channel = private`, `force = true` to bypass cooldowns/dedupe.
- Pipe result through `no-lube-orchestrate` (or directly post via the private push path) so the rendered card goes to the Private TG channel only.
- Confirm in `no_lube_post_log` that `channel = 'private'` and `tg_message_id` is set, and that `token_image_url` resolved from a live source (Helius/Dex), not the fallback.

## 2. Snapshot-first, Big Picture later

Current state: `no-lube-orchestrate` decides per-event which card to compose; on first ingest it tries Big Picture immediately if gates pass, otherwise nothing fires until re-sighting.

Change to a two-phase sequence per new token:
- **Phase A — Snapshot (fast)**: on ingest, always compose + push `snapshot` template immediately using whatever data is available (price, mcap, dev, basic socials). No wait on mesh/holders.
- **Phase B — Big Picture (deferred)**: schedule a follow-up Big Picture pass that fires once `holders_refreshed_at` AND `mesh_hydrated_at` are stamped (or after a max-wait, e.g. 8 min, whichever first). Implemented either by:
  - a small `pending_big_picture` queue table with `enqueued_at`, polled by an existing cron, OR
  - a self-rescheduling `pg_net.http_post` chain inside `no-lube-orchestrate` (cheaper, no new table).
- Guarantee ordering: Big Picture compose checks that the snapshot for the same `(mint, channel)` was posted first; if not, posts snapshot inline before Big Picture.

## 3. 2x / 4x multiplier trigger audit

Investigate end-to-end why multiplier-triggered milestone images may not be firing:
- Query `telegram_insider_token_lifecycle` for rows where `entry_market_cap` is NULL or 0 — those can never compute a multiplier.
- Check the re-sighting handler in `no-lube-orchestrate`: confirm `current_mcap` is being read from a live source (Dex cache) at re-sight time, not from a stale snapshot, and that `Math.floor(current / entry) > last_multiplier` actually updates `last_multiplier`.
- Verify the milestone branch calls `compose-card` with the milestone template (not snapshot) and that `multiplier` is passed into the template vars.
- Check `no_lube_post_log` for any rows with `kind = 'milestone'` in the last 7 days; if zero, the trigger path is dead.
- Report findings; fix the broken link (likely either entry_market_cap not being seeded on first post, or last_multiplier never being persisted back).

## Deliverables

- One demo Big Picture post visible in the Private TG channel.
- Orchestrator refactored so every new token gets Snapshot → Big Picture in that order.
- Written diagnosis of the multiplier trigger path with the specific broken step identified and patched.

Awaiting **Plan Approved** before any code or DB changes.
