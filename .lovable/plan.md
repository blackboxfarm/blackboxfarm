## Why the Public channel has gone silent

Public posts are not a separate ingestion path — they only fire from the **re-sighting / milestone flow** in `no-lube-orchestrate`. Yes, we DO track the gain factor (`ratio = current_mcap / entry_market_cap`) and we only fire 2x, 3x, 4x… milestones (`Math.floor(ratio)` must exceed `prev.last_multiplier`). That logic is fine.

The blocker is one step earlier in the pipeline.

### Evidence from the DB (last 36h)

- Re-sighting events per hour collapsed from ~190/hr on May 27 23:00 → **0/hr from May 28 ~21:00 onward**.
- Snapshots are still flowing fine (Phase 1).
- Every single new token since 21:56 May 28 has a `snapshot` row but **zero `big_picture` rows**.
- Lifecycle rows for every one of those tokens show:
  - `creator_status = resolved` ✓
  - `blackbox_harvested_at` ✓
  - `holders_refreshed_at` = **NULL** ✗
  - `mesh_hydrated_at` = **NULL** ✗

### Why this kills Public posts

`no-lube-orchestrate` gates the Big-Picture post on `holders_refreshed_at` + `mesh_hydrated_at` + `blackbox_harvested_at`. With holders/mesh missing, the orchestrator returns `big_picture_not_eligible_yet` forever. Re-sighting (the ONLY path that posts to Public) requires `hasBigPicture === true`, so it can never trigger. No big_picture → no re-sighting → no public post.

The 2x/3x/4x detector is healthy; it's just never reached because no token graduates past the snapshot phase.

## Plan

1. **Confirm root cause** — check `bagless-holders-report` and the mesh-hydration cron logs for the cutoff window (~21:56 UTC May 28). Likely a Helius quota wall, a deploy regression, or the cron stopped firing.
2. **Restart / fix the holders refresher** so `holders_refreshed_at` and `mesh_hydrated_at` get stamped again. (Most likely a single edge function or pg_cron job that needs re-enabling, an API-key rotation, or a fix to a thrown error.)
3. **Backfill the stuck queue** — re-run `bagless-holders-report` for the ~15 lifecycle rows created since 21:56 May 28 so they catch up to Big-Picture and become eligible for re-sighting.
4. **Add a safety valve** in `no-lube-orchestrate`: if a token is older than N minutes and only the holders/mesh gates are blocking it, surface a single warning row in `system_alerts` (or similar) so this never silently stalls Public again.
5. (Optional, separate) clean up `channel = NULL` on historical `no_lube_post_log` rows where `tg_message_id` proves a Public push happened, so the Process tab analytics are accurate.

No changes to the 2x/3x/4x milestone logic — that's working as designed.

Awaiting **Plan Approved** before I dig into logs and patch the holders/mesh stage.