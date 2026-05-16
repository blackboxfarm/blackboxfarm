## What I found in the DB right now

| manual_status | rows | with `tweet_text` saved |
|---|---:|---:|
| pending | **160,874** | 1,455 |
| posted_manual | 13 | 13 |
| skipped_manual | 4 | 4 |

So the "only 50 pending" you see is a **UI cap** — `ManualXPostingQueue.tsx` hard-codes `.limit(50)` on both the Pending and History lists. The real backlog is 160k+. Composed `tweet_text` is only present on ~1,455 rows because compose runs lazily (only when you click "Compose Missing"), so anything never reviewed never had its text stored.

The number `15,612` you mentioned earlier was the older "posted to X" count from a different filter; full pending is much larger. We'll treat that as legacy noise and **start the archive clean going forward** as you asked.

---

## Plan

### 1. Save the FULL manual-X payload at compose time (not just `tweet_text`)

Add columns to `holders_intel_post_queue` so an archive row can be re-rendered exactly as it was posted, without re-running compose:

- `tweet_composed_at` (timestamptz) — when text was generated
- `ai_snippet` (text) — the AI one-liner (currently only inside `tweet_text`, will be stored standalone too)
- `health_grade` (text) — e.g. `A`
- `health_score` (int) — e.g. `89`
- `health_label` (text) — e.g. `King!!`
- `real_holders`, `total_wallets`, `whales_count`, `serious_count`, `retail_count`, `dust_count`, `dust_pct` (numerics) — the body stats
- `snapshot_label` (text) — e.g. `May 14, 9:36 PM EST`
- `hashtags_line` (text) — final hashtag line as posted
- `banner_used_url` (text) — exact image URL attached (decorated or dex)
- `posted_handle` (text, default `HoldersIntel`)

Then update `holders-intel-compose-preview` and `holders-intel-poster` so **every** compose writes the full structured payload (not just `tweet_text`). `tweet_text` stays as the canonical rendered string, the new columns are the render-from-DB source of truth.

### 2. Fix the "only 50 pending" UI

In `ManualXPostingQueue.tsx`:
- Remove the hard `.limit(50)`.
- Add proper pagination: page size selector **50 / 100 / 250 / 500**, prev / next, total-count badge ("160,874 pending"), and a search by mint or symbol/name (ILIKE).
- History tab gets the same controls.

### 3. New page: **📚 Token Archive** under Super-Admin → HoldersIntel

Route already exists at `/super-admin?tab=allstars&sub=...`; we add a new sub-tab `archive`.

Source: `holders_intel_post_queue WHERE manual_status='posted_manual' OR manual_tweet_url IS NOT NULL` (later we can flip the filter to "anything with `tweet_composed_at`" once compose runs auto).

Sort: `manual_posted_at DESC NULLS LAST, created_at DESC`.

Controls:
- Page size: 50 / 100 / 250 / 500
- Pagination: ‹ First · Prev … Next · Last ›
- Search: mint (full/partial) OR symbol/name (ILIKE)
- Filter chips: `trigger_source` (allstar / dex-top / manual / bot-dm / …)

### 4. Each archive row rendered as a **@HoldersIntel X post** (SS2 style)

Reusable component `<HoldersIntelTweetCard row={...} />` that mimics the X "Post" detail view:

```text
┌──────────────────────────────────────────────┐
│ [HI avatar] Holders Intel ✓                  │
│             @HoldersIntel                    │
│             ⓘ Automated by @blackbox_farm    │
│                                              │
│ 🔬 HOLDER INTEL: $WCM World Cup Meme         │
│ 3CQ1JwUEcMsxWMev8pw2KxpfujE2CRe4FEVMsBm5pump │
│ Health: A (89/100) 🆕 King!!                  │
│ ✅ 6,157 Real Holders                         │
│ 📊 7,999 Total Wallets                        │
│ 📸 Snapshot at May 14, 9:36 PM EST ⏱         │
│ 🐋 0 Whales (>$1K)                            │
│ 😎 10 Serious ($200-$1K)                      │
│ 🔢 6,146 Retail ($1-$199)                     │
│ 💨 1,842 Dust (<$1) = 23% Dust                │
│ 🧬                                            │
│ 📣 t.me/HoldersIntel                          │
│ FULL Holder Intel👇 blackbox.farm/holders?…   │
│                                              │
│ #Solana #CryptoTools #HoldersIntel            │
│ @blackbox_farm                                │
│                                              │
│ [banner image, 2:1]                           │
│                                              │
│ 10:25 PM · May 14, 2026 · Manual post         │
│ [↗ View original on X]  [🔗 Bubblemap]         │
└──────────────────────────────────────────────┘
```

Render strategy:
- If row has the new structured columns → render from them (exact reproduction).
- Else fall back to parsing `tweet_text`.
- Else show a "Not yet composed" placeholder with a one-click "Compose & Save" button (calls `holders-intel-compose-preview`).

Styling: dark X-card look, white `@HoldersIntel` header, blue verified badge, monospace mint, hashtag color `text-sky-400`, banner aspect 2:1.

### 5. Going-forward auto-save (no backfill required)

- Trigger `holders-intel-compose-preview` automatically on every new pending row from `holders-intel-scheduler` (small batch every cron tick: 25 rows / minute) so the archive populates organically.
- Historical 160k rows without composed text are **left as-is**; you said start fresh.

---

## Files I'll touch

- **Migration**: add columns listed above to `holders_intel_post_queue`.
- `supabase/functions/holders-intel-compose-preview/index.ts` — write the full structured payload alongside `tweet_text`.
- `supabase/functions/holders-intel-poster/index.ts` — same payload on auto-poster path.
- `supabase/functions/holders-intel-scheduler/index.ts` — small auto-compose batch each tick.
- `src/components/admin/holders-intel/ManualXPostingQueue.tsx` — remove 50 cap, add pagination + search + true total count.
- **New** `src/components/admin/holders-intel/TokenArchive.tsx` — archive page with pagination/search/filters.
- **New** `src/components/admin/holders-intel/HoldersIntelTweetCard.tsx` — X-style render card.
- `src/components/admin/tabs/HoldersIntelTab.tsx` — wire new "📚 Archive" sub-tab.

No frontend public-page changes, no Telegram changes, no AI cost (compose already uses cached AI snippet).

---

Reply **Plan Approved** to ship it, or tell me what to change.