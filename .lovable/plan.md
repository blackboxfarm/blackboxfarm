## "Autopsy Now" button on Manual X Posting Queue

Add a one-click way to send a queued token through the full Autopsy pipeline directly from the Manual X Posting card, then automatically append a death-call addendum (with the published autopsy URL + regenerated banner) to the composed tweet text.

**X Premium account** — no 280-char trimming. Tweets can run long (up to 25,000 chars). The addendum is appended verbatim; original tweet body is never truncated.

### 1. New edge function: `holders-intel-autopsy-now`
Path: `supabase/functions/holders-intel-autopsy-now/index.ts` (verify_jwt = false, admin-gated by JWT check inside).

Input: `{ queue_id: uuid }`
Steps:
1. Load the queue row (`token_mint`, `symbol`, `name`, `tweet_text`).
2. Upsert an `autopsy_candidates` row with `source_feed='admin_manual'`, `status='pending'`, ticker/symbol/name from queue (onConflict `token_mint`). If a row already exists in a terminal state, force it back to `pending` so the writer re-processes.
3. Invoke `autopsy-writer` with `{ candidate_id }` and **await** completion. Writer returns `slug` and creates the `autopsy_reports` row (drafted or auto-approved).
4. Force `autopsy_reports.status='approved'` for that slug (admin override — user explicitly asked for "Full Generate" + URL).
5. Invoke `autopsy-banner-overlay` for the candidate (await), then re-read `autopsy_reports.hero_image_path`.
6. Build the public URL: `https://blackbox.farm/autopsies/<slug>`.
7. Append addendum to existing `tweet_text` (skip if it already contains the slug):

   ```
   
   ⚰️ This coin is dead IMHO.
   Full forensic autopsy → https://blackbox.farm/autopsies/<slug>
   ```

   No truncation — Premium account allows long-form. Persist the new text back to `holders_intel_post_queue.tweet_text`.
8. Update queue row with autopsy linkage columns (see migration).
9. Return `{ slug, autopsy_url, hero_image_path, tweet_text }`.

Non-blocking failures (banner gen) return the URL anyway with a warning flag.

### 2. Migration
Add to `holders_intel_post_queue`:
- `autopsy_slug text`
- `autopsy_url text`
- `autopsy_hero_image text`
- `autopsy_triggered_at timestamptz`
- `autopsy_triggered_by uuid`

No RLS changes (admin-only table).

### 3. UI: `ManualXPostingQueue.tsx`
For each card:
- New button **"⚰️ Autopsy Now"** next to Generate/Copy. Disabled while running; shows spinner + "30–60s" hint (writer takes a while).
- On success:
  - Refresh row → tweet preview now shows appended addendum block (highlighted with destructive border).
  - Show inline thumbnail of `autopsy_hero_image` (clickable → opens autopsy URL in new tab).
  - Show pill: "Autopsy published · view ↗" linking to `/autopsies/<slug>`.
- If `autopsy_slug` already exists on the row, button label changes to **"Re-run Autopsy"** and existing link/banner stay visible.
- Char counter updates but no warning — Premium has no practical limit.
- Toast feedback: "Autopsy generated · tweet updated" or error.

### 4. Out of scope
- No changes to autopsy taxonomy, classification thresholds, or Tier-A/B gating logic beyond the explicit admin-approve override.
- No automatic posting to X — user still copy-pastes manually.
- No Telegram path changes.

### Technical notes
- `autopsy-writer` already accepts `{ candidate_id }` and returns `{ slug, status }` per result.
- `autopsy-banner-overlay` is invoked best-effort inside `autopsy-writer`; we call it again explicitly to guarantee the regenerated banner exists before returning.
- Public autopsy route is `/autopsies/<slug>` — `Autopsies.tsx` / `AutopsyArticle.tsx` work for both static and DB rows.

Build order: migration → `holders-intel-autopsy-now` edge function → wire button + state + thumbnail into `ManualXPostingQueue.tsx`.
