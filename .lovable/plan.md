## What's actually broken (diagnosis)

Your "Views" column is reading `intel_briefing_views`. I queried the table — across **all 34 published articles, only ONE has any data**: 10 crawler hits on "How to Detect a Rug Pull". Everything else is `0/0/0`. The Nov 19 article you advertised on Instagram has zero rows.

**Root cause: the RLS policy silently rejects every human visit.**

`supabase/migrations/...intel_briefing_views.sql`:
```sql
CREATE POLICY "Service role can insert views"
  ON public.intel_briefing_views FOR INSERT
  TO service_role WITH CHECK (true);
```

But `src/pages/IntelBriefingArticle.tsx` (line 64) inserts from the **browser** using the `anon` key:
```ts
supabase.from('intel_briefing_views').insert({...}).then(({ error }) => {
  if (error) console.warn('[view-track]', error.message);  // swallowed
});
```
Anon → not service_role → RLS denies → error logged to console only → user sees "0 views".

**Why the one article has 10 crawler hits:** those came in through `share.blackbox.farm/<slug>` → `intel-share` edge function, which runs as service_role and inserts successfully. Direct hits on `/intel/briefing/<slug>` (which is the URL your IG/FB/Threads breadcrumbs link to) bypass `intel-share` entirely.

**Secondary issues found:**
1. **No bot detection on the direct article route.** `IntelBriefingArticle.tsx` blindly tags every hit as `'human'`. AI spiders that execute JS (Perplexity, ChatGPT browse, Claude) get counted as humans; non-JS bots aren't counted at all.
2. **No deduplication.** A page refresh = a new row. Anonymous user reading 5 paragraphs = 5+ rows if they navigate.
3. **`referer` is captured but never displayed.** Even when tracking works, the dashboard hides it — so you can't see "12 views from instagram.com, 8 from facebook.com" which is exactly what you'd want to validate the breadcrumb campaign.
4. **No ad-campaign attribution.** Instagram Promoted posts append `?utm_source=ig` (or similar) — nothing in the pipeline reads or stores `utm_*` query params.

---

## The fix (4 parts)

### 1. New edge function `track-briefing-view` (server-side, service_role)

A tiny POST endpoint the article page calls. Runs as service_role so RLS lets it write. Does:
- **Bot UA detection** — same regex set already used in `intel-share` (googlebot, bingbot, chatgpt, claudebot, perplexity, gemini, applebot, etc.) extracted into `_shared/bot-detector.ts` so both functions share one list.
- **IP capture** from `x-forwarded-for` / `cf-connecting-ip`.
- **Referrer capture** + parse hostname → `referrer_source` (e.g., `instagram.com`, `facebook.com`, `t.co`, `direct`).
- **UTM capture** — read `utm_source`, `utm_medium`, `utm_campaign` from the URL the client passes.
- **Per-session dedup** — accept a `session_id` from the client (sessionStorage UUID) + briefing_id; if a row exists for that pair within the last 30 min, skip.
- Uses `assertDbWrite` (per the zero-tolerance silent-fails memory) so any future failure throws loudly instead of being swallowed.

### 2. Schema additions to `intel_briefing_views`

Migration adds:
- `referrer_source TEXT` (parsed hostname, indexed)
- `utm_source TEXT`, `utm_medium TEXT`, `utm_campaign TEXT`
- `session_id TEXT` (indexed with briefing_id for dedup lookup)
- Plus a partial unique index on `(briefing_id, session_id, date_trunc('hour', created_at))` to harden dedup at DB level.

No RLS change needed — service_role insert policy already exists. (Optionally tighten the `SELECT` policy to admins only, since right now any authenticated user can read every view row.)

### 3. Rewire `IntelBriefingArticle.tsx`

Replace the broken direct insert with a call to the new `track-briefing-view` edge function:
- Pass `briefing_id`, `slug`, `session_id` (from sessionStorage), `document.referrer`, `window.location.search` (for UTMs).
- No need to pass UA — the function reads it from request headers, which is more reliable.
- Keep the `useRef` guard so React StrictMode double-mount in dev doesn't double-fire.

### 4. Dashboard upgrades (`IntelBriefingsManager.tsx`)

- Update the views query to also fetch `referrer_source` + `utm_source`.
- Expand the per-row tooltip from "Humans / Crawlers / AI Bots" to also show **"Top sources"** (top 5 referrer hostnames + counts) and **"Campaign hits"** (utm_source breakdown). This is what lets you immediately see *"OK, my Instagram ad drove 47 visits to article #3"*.
- Add a small **"Last 24h / 7d / 30d"** segmented control on the Views header so the column can show recent activity instead of all-time, which matches your "tracking daily updates" mental model.
- Show `—` only when truly zero; right now `s.total === 0` shows `—` even if there are AI bot hits, which is misleading.

---

## Backfill question — quickly handled, not asked

Existing rows can't be reconstructed (the inserts never happened). The Nov 19 article's IG/FB/Threads traffic is **lost**. Going forward, every visit will be tracked correctly within minutes of deploying. I'll add a console line on first deploy so you can sanity-check by visiting the article in an incognito window and watching a row appear.

---

## Files

**Create**
- `supabase/functions/track-briefing-view/index.ts`
- `supabase/functions/_shared/bot-detector.ts` (extracted from intel-share)
- `supabase/migrations/<ts>_intel_briefing_views_referrer_utm.sql`

**Edit**
- `src/pages/IntelBriefingArticle.tsx` — call edge function instead of direct insert
- `src/components/admin/IntelBriefingsManager.tsx` — expanded tooltip + time-range filter
- `supabase/functions/intel-share/index.ts` — switch to shared bot-detector + write referrer/utm fields

**No edit needed**
- RLS policy is correct as-is (service_role already allowed). The browser was just calling the wrong path.

---

## Out of scope (flagging for next pass if you want)

- **Cloudflare Worker bot detection.** The `blackbox-og-router` worker already intercepts `share.blackbox.farm`. We could extend it to also tag bot/non-bot at the edge for `/intel/briefing/*` and forward a header — more accurate than UA matching alone, but a bigger change.
- **Geo/country breakdown.** CF gives `cf-ipcountry` for free; could store + display.
- **Time-on-page / scroll-depth tracking.** Real "engagement" metrics. Out of scope unless you ask.