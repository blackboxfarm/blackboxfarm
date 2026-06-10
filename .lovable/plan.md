# No Lube — Cleanup, Gap-Fill & Deliverability Plan

## Scope (what's in the "No Lube" subsection)

UI panels (under `src/components/social/`):
- `NoLubeChannelPanel` (Default / Public / Leaks / Private / Snapshot / Intel Update)
- `NoLubeProcessPanel` (Insiders → No Lube live queue)
- `NoLubeFlowLog` (5-stage per-CA pipeline)
- `NoLubeRecentSightings` (post log + re-trigger)
- `NoLubeArchivePanel` (card renders)
- `NoLubeDailiesPanel` (daily Top-20)
- `NoLubeTemplateManager`, `NoLubeAssetLibrary`, `NoLubeProfileHeader`

Edge functions: `no-lube-orchestrate`, `no-lube-compose`, `no-lube-compose-card`, `no-lube-render-card`, `no-lube-push`, `no-lube-ingest`, `no-lube-milestone-sweeper`, `no-lube-legacy-sweeper`, `no-lube-social-credential`, `nolube-channel-roster-sync`, plus the `insiders-*` chain that feeds it.

---

## Gaps & issues found

### A. Observability / error-checking
1. **No unified failure view.** `NoLubeProcessPanel`, `FlowLog` and `RecentSightings` each query a slice — operators cannot answer "what is stuck right now?" in one place. Missing: a "Stuck / Failed" tab filtering rows where `ingest_last_error IS NOT NULL`, `creator_status='unresolvable'`, `kyc_status='failed'`, `mesh_promotion_status='failed'`, or `no_lube_post_log.block_reason` set in last 24h.
2. **`runPipeline` button swallows errors.** `NoLubeProcessPanel.runPipeline` ignores `error`/non-2xx from `insiders-pipeline-orchestrator`; user sees nothing if it fails. Same pattern in `regenBg/runNow/rerender/repost` (Dailies) — errors are toasted but no row-level retry log.
3. **No edge-function run log surface.** We rely on Supabase logs. Add a small `no_lube_run_events` viewer (last 50 invocations w/ status + duration + error) sourced from `withRunLog`.
4. **Post gate failures are invisible per-channel.** Gate failures from the orchestrator (`not_eligible_yet` + reason) aren't persisted per-mint/per-channel for the UI — `FlowLog` shows "awaiting gate" but not which check failed (entry_mc=0? mesh missing? stale DexScreener?).
5. **Latency SLOs missing.** `ingest_latency_ms` is shown but there's no alert when p95 crosses a threshold (e.g. > 30s) or when `dev_wallet_source='in_process'` rows pile up.

### B. Deliverability (Telegram push reliability)
6. **No Telegram send retry/DLQ.** `no-lube-push` failures (429 flood-wait, 5xx, chat migrated, bot kicked) appear to log to `no_lube_post_log` once and stop. Need: bounded retry w/ exponential backoff for 5xx + `Retry-After` honoring for 429; permanent failures (`chat_not_found`, `bot was kicked`, `forbidden`) flip a `channel_health` flag and surface in Channel panel.
6b. **No flood-wait coordination.** Multiple channels can push within the same second; Telegram's 20 msg/min/group limit isn't centrally throttled.
7. **Idempotency holes.** `no_lube_post_log` dedup is per (mint, channel) but reruns from the "Send" button can double-post if user clicks twice fast — needs an in-flight lock (`composed_at` exists; add `pushing_started_at` + UNIQUE partial index).
8. **Image generation falls back silently.** `no_lube_card_renders.fallback_reason` is captured but the operator-facing card just shows a "fallback" badge — no link to the underlying error (Lovable AI Gateway 429? prompt rejection?). Surface the row's full error + a one-click "Regenerate" button (currently only Archive panel — missing from Channel Compose).
9. **No "did Telegram actually receive it" verification.** We store `tg_message_id` only on the bot's reported success. We don't reconcile against a follow-up `getUpdates` / `getChat` ping or detect message deletion by mods.
10. **Snapshot post rides Private chat config** (per panel comment) but there's no guard preventing snapshot from being sent if Private has `chat_id IS NULL` — user gets a confusing error.

### C. Pipeline hygiene / gap-fill
11. **`dev_wallet_source = 'in_process'` never times out.** If Solscan misses AND background enrichment also misses, the row sits in_process forever; no escalation/retry budget. Add `in_process_since` + 30-min escalation to Birdeye/Helius DAS fallback.
12. **`mesh_hydrated_at IS NULL` rows have no maximum age.** Gate check `mesh_hydrated_at IS NOT NULL` blocks posting; no sweeper re-queues old mints into mesh hydration after N hours.
13. **`creator_status='unresolvable'` after 3 attempts is terminal forever.** 7-day cooldown exists in the orchestrator memory file but no UI surface to manually re-arm a row (operators must SQL).
14. **DexScreener staleness check** ("≤5 min") relies on cache freshness — no UI indicator showing the cache age when the operator clicks Compose. A stale-cache compose can produce wrong multipliers.
15. **`is_rugged` / `terminal_dead` flags** aren't recomputed on schedule; an old "rugged" flag may suppress a recovered token forever.
16. **Channel roster sync** (`nolube-channel-roster-sync`) has no last-run indicator in `NoLubeChannelPanel`.

### D. UX / consistency
17. **6 channel "kinds" but inconsistent post-kind toggle** — only `default`, `public`, `private` show the snapshot/big_picture toggle; logic comments suggest `snapshot` and `intel_update` are post-kinds masquerading as channels. Consolidate into 3 channels × N post-kinds.
18. **Per-token popup in `NoLubeProcessPanel`** dumps 40+ fields raw — group into sections (Ingest / Creator / Dev / KYC / Mesh / Posts) with copy buttons.
19. **No "force re-run from stage X"** action — currently only "Run pipeline now" runs the entire orchestrator. Add per-row buttons: re-resolve creator, re-trace KYC, re-hydrate mesh, re-compose, re-push.
20. **Missing health header** above the Process tab: counts of pending / in_process / failed / posted-last-1h.
21. **No empty-state guidance** when Telegram chat is unconfigured.

### E. Data integrity
22. **`no_lube_post_log.last_multiplier` is legacy** — `RecentSightings` already computes `trueMult` from lifecycle entry. Either backfill + drop the column or rename to `legacy_multiplier_at_post` to remove the trap.
23. **No FK between `no_lube_post_log.token_mint` and `telegram_insider_token_lifecycle.token_mint`** — orphaned post rows after lifecycle archival.
24. **`pipeline_reset_markers`** is used by Process panel but not by FlowLog or RecentSightings — they show "archived" pre-reset rows; should respect the same marker.

---

## Proposed plan (phased, smallest-risk first)

### Phase 1 — Observability (no behavior change)
- Add **Health header strip** on Process tab: pending / in_process / failed / posted_1h / posted_24h.
- Add **"Stuck & Failed" sub-tab** under Process with row filters across `ingest_last_error`, `creator_status='unresolvable'`, `kyc_status='failed'`, `mesh_promotion_status='failed'`, gate-block in last 24h.
- Add **per-row Action menu**: Re-run ingest / Re-resolve creator / Re-trace KYC / Re-hydrate mesh / Re-compose / Re-push.
- Surface **edge-function errors** in `runPipeline`, `regenBg`, `repost`, `rerender` toasts (currently silent on non-throw failures).
- Show **DexScreener cache age** in Compose dialog header (green ≤30s, amber ≤5m, red stale).

### Phase 2 — Deliverability hardening (edge-function changes)
- `no-lube-push`: bounded retry (3x) with backoff; honor 429 `Retry-After`; classify permanent vs transient errors; flip `channel_health` on permanent.
- Add **`channel_health` table** (per profile_kind): `last_ok_at`, `last_error`, `consecutive_failures`, `disabled_until`. Surface as badge on each Channel tab.
- Central **Telegram rate-limiter** (Postgres advisory lock or `pg_throttle`) per chat_id.
- **In-flight push lock** on `no_lube_post_log`: `pushing_started_at` + UNIQUE partial index on `(mint, channel, post_kind) WHERE posted IS NULL AND pushing_started_at > now()-interval '60s'`.
- Snapshot pre-flight: refuse if Private chat unconfigured (clear UI error, not silent failure).
- Persist **gate-failure reason** on `no_lube_post_log` per attempt so FlowLog can show "blocked: mesh_hydrated_at IS NULL" instead of generic message.

### Phase 3 — Pipeline gap-fill
- Add `in_process_since` column; sweeper re-tries dev-wallet resolution via Birdeye/Helius DAS fallback at 30m, 2h, 6h; mark `unresolvable` after 24h with reason.
- Mesh hydration sweeper for rows older than 1h with `mesh_hydrated_at IS NULL`.
- `is_rugged`/`terminal_dead` re-check job (daily).
- Manual "Re-arm" button to flip `creator_status='unresolvable'` back to `unknown` (operator override, logged in audit).
- Apply `pipeline_reset_markers` filter to FlowLog + RecentSightings for consistency.

### Phase 4 — Schema / data cleanup
- Drop or rename legacy `no_lube_post_log.last_multiplier` after backfilling `entry_market_cap` everywhere.
- Add FK / cascade rules between `no_lube_post_log` and lifecycle.
- Consolidate channel kinds: keep `public` + `private` + `default`; demote `snapshot` and `intel_update` to post-kinds (already de facto true).

---

## Implementation notes (technical)

```text
NoLubeProcessPanel
 ├── HealthStrip (counts via 1 RPC: no_lube_health_summary())
 ├── Tabs: Live | Stuck | History
 └── RowActions (dropdown invoking targeted edge fn per stage)

no-lube-push (edge)
 ├── classifyError(tgResp) -> {kind: transient|permanent, retryAfter?}
 ├── retry loop (max 3, jittered backoff)
 ├── on permanent: upsert channel_health (disabled_until = now()+interval '1h')
 └── always: insert/update no_lube_post_log with attempt#, block_reason

channel_health table
 (profile_kind PK, last_ok_at, last_error, consecutive_failures, disabled_until)
 GRANT select to authenticated, all to service_role; RLS allow read to admin.
```

No new third-party services. All work inside existing Supabase + Lovable Cloud edge functions.

---

## What I'd ask before building
1. Do you want all 4 phases, or start with Phase 1 + 2 only (the highest-leverage)?
2. Should "permanent failure" auto-disable a channel, or only warn (your fail-open policy on guards suggests warn-only — confirm)?
3. Keep `snapshot` and `intel_update` as separate tabs in the UI even after we collapse them server-side, or change the UI too?
