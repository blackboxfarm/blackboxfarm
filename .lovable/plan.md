## Goal

Make recycling detection event-driven on the canonical "2nd-token-link" rule, log unlimited name history, and make the bubblemap re-root by input type with readable labels.

---

## Part 1 — Canonical Recycle Rule (single source of truth)

**Rule (community):** Recycle event fires the moment the same `community_id` is observed linked to a 2nd distinct `token_mint`. Name changes alone are appended to `name_history` and never raise an event.

**Rule (handle, two triggers):**
1. Same `x_user_id` linked to a 2nd distinct `token_mint`, OR
2. Same `x_user_id` appears as Creator/Admin on a 2nd distinct `community_id`.

Handle changes alone (`@a → @b` for same `x_user_id`) are appended to `handle_history` only.

**TRIAD recorded per recycle event:** `token_mint` + `community_id` + `creator_x_user_id` (+ derived `dev_wallet` + `kyc_root` when known).

### New table: `recycle_events`
- `entity_type` ('community' | 'handle')
- `entity_id` (community_id or x_user_id)
- `prev_token_mint`, `new_token_mint` (for trigger #1)
- `prev_community_id`, `new_community_id` (for handle trigger #2, nullable)
- `prev_label_snapshot` jsonb, `new_label_snapshot` jsonb
- `dev_wallet`, `kyc_root` (nullable, best-effort at event time)
- `severity` ('info' | 'yellow' | 'red')  
  - info = 2nd link, names unchanged  
  - yellow = 2nd link + radically different name  
  - red = ≥3 distinct tokens OR confirmed rug in chain
- `triggered_by` (mint, scraper-write, dex_paid, rug_flip, manual)

### Hooks (all already exist as scoring trigger points — extend, don't add cron)
- `_shared/mesh-ingest.ts → evaluate_for_token` → also emits `recycle_events`
- `_shared/x-community-resolver.ts → evaluate` → emits when 2nd token detected
- `_shared/x-handle-resolver.ts` → on every resolve, check `linked_token_count` increment AND check if user_id now appears in ≥2 distinct communities as creator/admin
- `dex-paid-checker`, `insiders-mesh-promoter` → already call `fireRecycledScorer`; extend trigger to also write `recycle_events`

No new cron. The existing 6h fallback already catches drift.

---

## Part 2 — Phanes Backfill Strategy

- **First discovery of a handle** → DM Phanes once (`/x {handle}`) for historical name/handle/community history. Store snapshot.
- **No periodic re-poll.**
- **Re-poll Phanes ONLY when a `recycle_events` row is inserted for that handle** (severity ≥ yellow). This catches "what did Phanes know that we didn't" at the exact moment something interesting happened.
- New column `x_account_registry.phanes_last_polled_at` already exists → just gate re-poll by `severity` instead of cadence.

---

## Part 3 — Bubblemap: Universal Input → Different Centerpiece

Detect input type in `PublicBubbleMap.handleSearch` and select view template:

| Input | Centerpiece | Default view | Fan-out depth |
|---|---|---|---|
| Token CA / `$TICKER` | Token | Bubble (current) | current |
| X Handle (`@x` or `x.com/x`) | **Handle** | **Schematic** | Communities → Tokens → Dev Wallets → KYC root (4 hops) |
| X Community URL/ID | Community | Schematic | Tokens → Dev Wallets → KYC root |
| Wallet address | Dev Wallet | Schematic | Tokens → Communities → KYC root |

Reuse existing schematic. New file `src/components/bubble-map/inputClassifier.ts` returns `{ kind, value }`. Existing auto-switch-to-schematic on `@` is already shipped — extend to community URLs + wallet addresses.

### Readable Labels SLA (handle/community queries)

Spinner-on-unresolved approach:
- On render, every `x_community` node without a `human_name` and every `token` node without a `ticker` shows a small inline spinner in its label.
- Fire a single batched `resolve-labels` edge function call with all unresolved IDs.
- As results stream back, swap spinner for `<CommunityName>` / `$<TICKER>`.
- Hard timeout 4s → fall back to `Community #<id>` / `<truncated mint>` with a subtle "?" marker.

### New edge function: `resolve-labels`
Input: `{ communities: string[], tokens: string[] }`  
Output: `{ communities: { [id]: { name, member_count, recycled_count } }, tokens: { [mint]: { ticker, name } } }`  
Reads from `x_communities` + `tokens` cache. Misses go onto `x_community_resolution_queue` and `token_metadata_queue`. Always returns within 2s (no live X API in the hot path).

---

## Part 4 — Files Touched

**New**
- `supabase/migrations/<ts>_recycle_events.sql` — table + indexes + helper RPC
- `supabase/functions/resolve-labels/index.ts`
- `supabase/functions/_shared/recycle-events.ts` — `recordRecycleEvent()` helper using `assertDbWrite`
- `src/components/bubble-map/inputClassifier.ts`

**Edited**
- `supabase/functions/_shared/mesh-ingest.ts` — emit recycle event on 2nd-token-link
- `supabase/functions/_shared/x-community-resolver.ts` — emit recycle event
- `supabase/functions/_shared/x-handle-resolver.ts` — emit recycle event (both triggers) + gate Phanes re-poll on event
- `supabase/functions/_shared/trigger-recycled-scorer.ts` — also fire `recordRecycleEvent`
- `src/components/bubble-map/PublicBubbleMap.tsx` — input classification, route to centerpiece
- `src/components/bubble-map/BubbleMapSchematic.tsx` — handle/wallet/community centerpiece templates, spinner labels, batched `resolve-labels` call

---

## Part 5 — Out of Scope (later)

- Sniper/Cheerleader/Vulture role derivation
- Dev Reputation Engine standalone page
- TG/Web unified `/mesh` route (we're keeping bubblemap as the surface)

---

## Acceptance

1. Submitting a 2nd token whose community matches an existing record inserts exactly one `recycle_events` row with `entity_type='community'`.
2. Submitting `@pumpfun711` to bubblemap auto-switches to schematic with the handle as centerpiece, communities show readable names within 2s (spinner first), tokens show `$TICKER`, and recycled communities show the existing `♻ Recycled ×N` badge.
3. No new cron jobs added; existing 6h fallback unchanged.
4. Phanes is called once per new handle, then only re-polled on `severity ≥ yellow` recycle events.
