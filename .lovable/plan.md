## Quick feedback on your asks

All five are sensible and additive. The template editor and "Regenerate Post" button in particular are overdue — templates already live in the `holders_intel_templates` DB table (`small`, `large`, `tg_posted`, `tg_public_post`, `x_advert_*`, `tg_advert_*`, etc.), but there is no UI to edit them. The poster reads them at runtime, so an editor immediately takes effect — no redeploy. The DexScreener banner + decorated variant fits cleanly alongside the existing autopsy-banner flow (we already do something very similar for DeadTokens autopsies via `imagegen` + transparent overlays).

One thing worth confirming before I build: for the decorator, I'll create **one new edge function** `holders-intel-banner-decorate` that mirrors the autopsy decorator pattern but with a rotating "Featured / Trending / HOT" themepack (flames, magnifier, "?", floating chat avatar, varied memecoin emoji). It reuses Lovable AI Gateway image-edit (Nano Banana) so cost is the same as autopsy banners.

---

## Plan

### 1. KYC-skip guard for Insiders Lifecycle "full retrace"
- File: `supabase/functions/insiders-lifecycle-builder/index.ts` (and orchestrator pass-through if needed).
- Add the one-line guard when iterating creators: `if (creator && row.kyc_root_wallet) continue;` so rows with a known KYC root are skipped on full retrace.
- Add an opt-out flag `force=true` so admins can still force a full re-walk from the UI when they want to.
- Log a one-line summary: `[lifecycle] skipped N rows with existing KYC, retraced M`.

### 2. New admin tab — "Tweet Templates"
- New file: `src/components/admin/holders-intel/TemplateEditor.tsx`.
- Wire into the Holders Intel super-admin tab strip next to "Manual X Posting".
- Lists all rows from `holders_intel_templates` (small, large, shares, subscription, tg_posted, tg_public_post, tg_search, tg_advert_1/2/3, x_advert_1/2/3/4) — plus an "Add new" button.
- Per row: name, monospace `<Textarea>`, char counter (with the same URL-as-23-chars rule used in the queue), Save / Reset / Preview-with-sample-data buttons.
- **Variable legend panel** (collapsible) listing every `{var}` the poster supports — `{TICKER}`, `{name}`, `{mint}`, `{health_grade}`, `{health_score}`, `{real_holders}`, `{total_wallets}`, `{whales}`, `{serious}`, `{retail}`, `{dust}`, `{dust_pct}`, `{lp_pct}`, `{snapshot_time}`, `{trending_rank}`, `{ai_summary}`, `{risk}`, `{holders_url}`, `{telegram_url}`, `{hashtags}`, etc. Pulled from `processTemplate()` in `holders-intel-poster/index.ts` so the legend stays accurate.
- Preview button calls `holders-intel-compose-preview` with `{ template_override: '<text>', queue_id: <latest pending> }` (small additive param) so admin can see the rendered tweet before saving.
- Save writes back to `holders_intel_templates` via supabase client (RLS gated to super-admin).

### 3. DexScreener banner thumbnail in the Manual X Posting Queue
- New shared helper: `supabase/functions/_shared/dexscreener-banner.ts` — given a mint, hits DexScreener token API and returns the banner/header image URL if present (`info.header` / `info.imageUrl` — fallback to `info.openGraph`).
- New small edge function `holders-intel-fetch-banner` that resolves + caches the URL onto `holders_intel_post_queue.dex_banner_url` (new nullable column).
- Migration: `ALTER TABLE holders_intel_post_queue ADD COLUMN dex_banner_url text, ADD COLUMN decorated_banner_url text;`
- UI: render `dex_banner_url` as a 96px thumbnail in each queue row with **Copy URL** + **Download** buttons (mirrors the autopsy composer pattern in `AutopsyTweetComposer.tsx`).
- Compose-preview edge function auto-fetches banner the first time a row is composed if missing.

### 4. "Decorate Banner" button — Featured/Trending/HOT theme
- New edge function `holders-intel-banner-decorate` (parallels `autopsy-banner-generator`).
- Pulls `dex_banner_url`, calls AI Gateway image-edit (`google/gemini-2.5-flash-image`) with a rotated prompt from a small themepack:
  - `Featured` (gold ribbon + sparkles), `Trending` (chart-up + lightning), `HOT` (flames), `🔥 Discovery`, `Snapshot 🔍`.
  - Always overlays: HoldersIntel chat-avatar (top-left), magnifier 🔍 icon, subtle "?" mark, varied memecoin emoji border, "HoldersIntel Snapshot" wordmark.
  - Includes a small **Risks** badge with text — `No obvious risks detected` OR `N risks on file — click to view all` — driven by the network-risk score we already compute in the poster (`risk` variable).
- Saves output to Supabase Storage bucket `holders-intel-banners`, writes URL to `decorated_banner_url`.
- UI shows decorated thumbnail next to the raw one with Copy URL / Download / Regenerate.

### 5. Regenerate Post button (uses fresh data)
- Already have `holders-intel-compose-preview` — extend it to accept `{ queue_id, force_refresh: true }` so it re-pulls the latest holder snapshot, mcap, trending rank, and AI summary instead of reusing cached `tweet_text`.
- Add **"♻️ Regenerate"** button in `ManualXPostingQueue.tsx` per row (sits next to "Generate now" / "Autopsy Now"). Disabled while running, with a small "as of HH:MM" stamp showing last compose time.

### 6. /holders deep-link format
- Use the canonical `?token={mint}` URL parameter (already enforced sitewide per memory) anywhere a "View on Holders" link is built — template legend will document this and the default `small` / `large` templates will be re-saved using `{holders_url}` which already resolves to `https://blackbox.farm/holders?token={mint}`.

---

## Technical notes (for reference)

- Templates table schema (already exists): `holders_intel_templates(template_name PK, template_text, updated_at)` — no schema change needed for editor.
- New columns on `holders_intel_post_queue`: `dex_banner_url text`, `decorated_banner_url text`, `decoration_theme text`.
- New storage bucket `holders-intel-banners` (public read).
- Reuses existing patterns: `imagegen` via Lovable AI Gateway, `assertDbWrite` for every DB write (per zero-tolerance memory rule), super-admin RLS on template edits.
- No client-side service-role usage.

---

## Out of scope (flag if you want it)
- Auto-rotating decoration theme on a schedule (currently one-shot per row).
- Bulk-decorate-all button (easy add later).
- Per-template A/B analytics (open question — useful but a separate build).

Shall I proceed with this plan, or do you want to adjust the decorator themepack / variable list before I build?