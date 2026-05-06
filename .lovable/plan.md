# Manual X Posting Queue — Plan

## Goal

Keep the existing Holders Intel funnel building its queue normally. Keep auto-posting to X disabled. Keep Telegram delivery untouched. Add a new admin workflow where you can:

1. See every queued token's **fully-composed tweet text** (the exact text the bot would have posted).
2. **Copy** it with one click.
3. Open X in a new tab (button provided), paste, post manually.
4. Click a checkbox to **mark as "Manually Posted"** (with optional pasted tweet URL/ID).
5. The token then drops out of the pending queue and the Telegram fork still fires.

---

## Current state (verified)

- `holders-intel-poster` composes tweet text at runtime from `template_text` + live stats (`processTemplate(tweetTemplate, stats)` at line 861). The text is **not** stored in `holders_intel_post_queue` — it's built, posted, then discarded.
- X posting is already paused inside `postTweet()` (line 420 — returns `skipped: true`). Telegram fork still runs after.
- Queue table `holders_intel_post_queue` has no `tweet_text` or manual-posting fields.

So we need (a) to capture the composed text into the row, and (b) a UI to act on it.

---

## Changes

### 1. Database migration

Add to `holders_intel_post_queue`:
- `tweet_text text` — the fully-rendered tweet (filled when poster composes, or on-demand from a new "compose preview" function)
- `manual_status text default 'pending'` — values: `pending`, `posted_manual`, `skipped_manual`
- `manual_posted_at timestamptz`
- `manual_tweet_url text` — optional URL the user pastes back after posting
- `manual_posted_by uuid` — admin user id

Add a new status value workflow: rows stay `status='pending'` for the Telegram side, but `manual_status` tracks the X side independently. (Or: introduce `status='manual_review'` that the poster sets when X is disabled — see Technical Details.)

### 2. Poster edge function (`holders-intel-poster`)

Two small edits:
- After `tweetText = processTemplate(...)` (line 861), **persist** `tweet_text` to the queue row before calling `postTweet`.
- When `postTweet` returns `skipped: true` (X paused), set `manual_status='pending'` and **do not** mark `status='posted'` for the X side — but still allow Telegram fork to run and complete. Row remains visible for manual action.

No behavior change while X is disabled — Telegram still posts as today.

### 3. New edge function: `holders-intel-compose-preview`

For tokens already in the queue that pre-date this change (no `tweet_text` yet), this function:
- Takes a `queue_id`
- Re-runs the same compose pipeline (fetch report → build stats → `processTemplate`)
- Saves `tweet_text` back to the row
- Returns the text to the UI

Lets the new tab work immediately on the existing backlog without waiting for a re-queue.

### 4. New admin tab: "Manual X Posting"

Location: `/super-admin` → Holders Intel → new sub-tab `📮 Manual X Posting` (added to `HoldersIntelTab.tsx`).

New component `src/components/admin/holders-intel/ManualXPostingQueue.tsx`:

- Lists rows where `manual_status = 'pending'`, newest first.
- Each card shows:
  - `$TICKER`, mint (truncated, link to DexScreener), market cap, queued time, trigger source.
  - **Tweet preview pane**: monospace box rendering `tweet_text` exactly as it would appear (with char count, 280 limit indicator).
  - If `tweet_text` is null → "Generate Preview" button → calls `holders-intel-compose-preview`.
  - **[Copy text]** button (writes to clipboard, toast confirm).
  - **[Open X compose ↗]** button → `https://x.com/intent/tweet` in new tab (text *not* pre-filled — you paste manually as you described).
  - **[ Mark as posted manually ]** checkbox → opens small inline form: optional paste of the resulting tweet URL → sets `manual_status='posted_manual'`, `manual_posted_at=now()`, `manual_tweet_url`, `manual_posted_by=auth.uid()`. Row disappears from the pending list.
  - **[Skip]** secondary action → `manual_status='skipped_manual'` (with optional reason).
- Header chips: pending count, posted-manual today, skipped today.
- Auto-refresh every 30s (same pattern as `PostingQueueViewer`).
- A small "History" toggle below shows last 50 `posted_manual` / `skipped_manual` rows with timestamps.

### 5. Existing `PostingQueueViewer` — no changes

It stays as-is for monitoring the Telegram side.

---

## Technical details

- **RLS**: New columns inherit table policy. Update action restricted to super-admins via existing `has_role(auth.uid(), 'admin')` pattern; add a policy `manual_post_admin_update` allowing UPDATE of only the four `manual_*` columns when `is_super_admin`.
- **Status semantics**: keep `status` for the Telegram/internal pipeline. Add `manual_status` as an orthogonal X-channel state. This avoids breaking the scheduler and keeps the Telegram fork independent (per your "do not touch Telegram" rule).
- **Compose preview function**: factor the inner stats-building section of `holders-intel-poster` into a shared helper `_shared/compose-tweet.ts` (export `composeTweetForMint(mint)`). Both `holders-intel-poster` and the new `holders-intel-compose-preview` import it. No duplicated logic.
- **Char counter**: client-side, mirror X's URL-shortening (URLs count as 23). Simple `twitter-text` style estimator inline — no extra dep.
- **Open-X URL choice**: use `https://x.com/intent/post` (raw, no prefilled text) per your spec — paste manually.
- **Audit**: `manual_posted_by` + `manual_posted_at` give a trail; can be surfaced in History.

---

## Out of scope

- No changes to Telegram poster, scheduler, or template editors.
- No re-enabling auto X posting.
- No Twitter API calls anywhere in the new flow.

---

## Build order

1. Migration (4 columns + RLS update policy).
2. Extract `_shared/compose-tweet.ts` from `holders-intel-poster` and wire poster to persist `tweet_text`.
3. New `holders-intel-compose-preview` edge function.
4. New `ManualXPostingQueue.tsx` component + tab entry in `HoldersIntelTab.tsx`.
5. Smoke test: pick a pending row, generate preview, copy, mark posted, confirm it leaves the list and history records it.
