## Fix Plan: No Lube Hardening Gaps

Address all 11 issues identified in the audit. Grouped by category.

### A. Hard breaks (UI shows nothing)

1. **Align `no_lube_health_summary` RPC ↔ `NoLubeHealthStrip`.**
   Update the RPC to return the exact keys the UI reads: `in_flight, in_process_stuck, mesh_pending, push_failures_24h, push_success_24h, rugged_recent`. Also include the existing breakdown keys (`pending, ingest_failed, creator_unresolvable, kyc_failed, mesh_failed`) so future widgets can reuse them.

2. **Fix `channel_health` column mismatch.**
   Migration: rename `profile_kind` → `channel_kind` (or add `channel_kind` and backfill), keep PK consistent. Update `bump_channel_failure` RPC + any references. UI query already uses `channel_kind`.

### B. Tracing / observability gaps

3. **Wrap new edge functions with `withRunLog`.**
   - `no-lube-sweeper` → log per-step counts via `logger.addMeta`
   - `no-lube-stage-rerun` → log `stage`, `mint`, `invoked`, outcome
   - `no-lube-push` → already updated; wrap entry, classify each attempt as info/warn/error events

4. **Wire `bump_channel_failure` from `no-lube-push`.**
   On every send: success → upsert `channel_health` row with `last_ok_at=now()`, `consecutive_failures=0`. Failure → call `bump_channel_failure(channel_kind, error_class, retry_after_seconds)`.

5. **Sweeper stale push-lock release: use `.neq('posted', true)` not `.is('posted', null)`.**

6. **`stamp_in_process_since` trigger: add BEFORE INSERT branch.**
   Stamp `in_process_since = now()` on INSERT when `dev_wallet_source='in_process'`, plus existing UPDATE OF logic.

### C. Wiring / logic polish

7. **Stage-rerun `creator`:** also clear `creator_status IN ('unknown','pending')` cooldown (reset `creator_attempts=0`, clear `creator_last_attempt_at` if column exists) so non-`unresolvable` stuck rows actually retry.

8. **Stage-rerun `push`:** invoke `no-lube-orchestrate` with `{ token_mint: mint, mint }` (both keys) so whichever the orchestrator expects works.

9. **Toast on failure** in `NoLubeHealthStrip` `load()` and `sweep()` via `useToast`. Distinguish RPC vs channel query errors.

10. **Add gate-block columns to `FIELDS` array** in `NoLubeProcessPanel` detail dialog: `gate_block_reason`, `gate_blocked_at`, `in_process_since`.

11. **Sweeper persistence:** with `withRunLog` (#3) cron heartbeat becomes visible in `edge_function_runs`; also add `logger.addMeta('report', report)` so per-step counts are queryable.

### Technical details

**Migration 1** — RPC + schema:
- `DROP FUNCTION no_lube_health_summary(); CREATE FUNCTION ... RETURNS jsonb` returning the 6 UI keys + 5 breakdown keys.
- `ALTER TABLE channel_health RENAME COLUMN profile_kind TO channel_kind;` (verify PK; may need DROP/RECREATE constraint).
- Update `bump_channel_failure(_channel_kind text, _error_class text, _retry_after_seconds int)` to use `channel_kind`.
- Replace `stamp_in_process_since` trigger to fire BEFORE INSERT OR UPDATE OF `dev_wallet_source`.

**Edge function edits:**
- `no-lube-sweeper/index.ts`: import `withRunLog`, wrap handler, fix `.is('posted', null)` → `.neq('posted', true)`, add `logger.addMeta` per step.
- `no-lube-stage-rerun/index.ts`: wrap with `withRunLog`, broaden creator re-arm, dual-key push invoke.
- `no-lube-push/index.ts`: ensure `withRunLog` wrap, add `bump_channel_failure` + success upsert calls in retry loop.

**UI edits:**
- `NoLubeHealthStrip.tsx`: add `useToast`, surface errors, no other shape changes (RPC will now match).
- `NoLubeProcessPanel.tsx`: extend `FIELDS` array with the 3 missing columns.

### Out of scope
- Re-architecting the Row type to be properly typed (cosmetic TS issue, not a functional break).
- New UI tabs beyond the existing Stuck/Failed filter.
