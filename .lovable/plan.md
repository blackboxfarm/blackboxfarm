
# No-Lube Card System — Template-First Redesign + Restore Posting

## A. Why no posts since 06:00 UTC (separate bug, fix first)

Last successful post: `2026-05-28 05:59 UTC` (BIZZY). Since then 487 compose attempts, all blocked (mostly "Dead — 24h price -94%" for `SUMMERBODY` retrying every minute).

Root cause: during last night's emergency cron cleanup, `insiders-pipeline-orchestrator-15m` was set to `active = false` and never re-enabled. That orchestrator is what drains newly-seen insider mints into `no-lube-ingest` → `no-lube-orchestrate`. Channel monitor still runs, but new mints aren't being routed.

Fix: re-enable that cron (migration) and confirm fresh tokens flow into `no_lube_post_log`.

## B. New card-generation architecture

### B1. Per-profile background templates (PNG)

Add table `no_lube_card_templates`:
- `profile_kind` ('private' | 'public')
- `language` (e.g. 'en','ko','universal')
- `aspect` ('landscape_tg' = 1024x640) — extensible later
- `template_url` (storage public URL)
- `template_name`, `enabled`, `is_default`
- `font_family` (Google font name, e.g. "Bebas Neue", "Inter", "JetBrains Mono")
- `font_url` (optional self-hosted .ttf)
- `safe_zones` JSONB — named rectangles where AI is ALLOWED to draw, e.g.
  ```
  {
    "mint_pfp":      {"x": 60,  "y": 140, "w": 140, "h": 140, "shape": "circle"},
    "ticker":        {"x": 220, "y": 150, "w": 500, "h": 80},
    "ca":            {"x": 220, "y": 230, "w": 500, "h": 30},
    "multiplier":    {"x": 60,  "y": 320, "w": 200, "h": 110},
    "entry_label":   {"x": 60,  "y": 480, "w": 200, "h": 30},
    "entry_value":   {"x": 60,  "y": 520, "w": 200, "h": 60},
    "current_label": {"x": 300, "y": 480, "w": 200, "h": 30},
    "current_value": {"x": 300, "y": 520, "w": 200, "h": 60},
    "character":     {"x": 680, "y": 60,  "w": 340, "h": 560}
  }
  ```
- `show_url` (bool — surface channel/X URL or not)
- `url_to_show` (optional override; default = profile's TG/X handle)
- `show_ca` (bool — small CA footer, default true)
- `exif_owner`, `exif_copyright`, `exif_description` per-profile defaults

New tab "Templates" in the Admin No-Lube panel:
- Upload PNG per (profile, language) or click "Generate" (calls existing image gateway).
- Visual editor to paint/drag the safe-zone rectangles on top of the template.
- Font picker, EXIF fields, URL/CA toggles.
- Preview button: composes a dummy card so you can see the final layout before saving.

### B2. Card pipeline (new compositor)

Replace today's "Gemini renders the whole card" with a deterministic compositor:

```
1. Load background template PNG for (profile_kind, language).
2. Fetch mint PFP from on-chain metadata → fit + circle-mask into mint_pfp safe zone.
3. Render fixed text overlays with the template's font:
     ticker, CA (truncated middle), multiplier, entry/current mcap.
4. AI step (Lovable AI gateway, gemini-3-pro-image-preview, EDIT mode):
     - Input: composited base (template + pfp + text)
     - Prompt: "place a character in the 'character' safe zone, do not modify
       any pixels outside this rectangle, do not add or change text".
     - Reference assets: 1 character + 1 sticker pulled from no_lube_assets
       (filtered by profile_kind + language). Apply randomization + last_used_at
       penalty so the same combo isn't reused within 24h.
5. Convert PNG → JPG (quality 92).
6. Strip all EXIF, inject our EXIF (owner, copyright, description, profile name).
7. Upload to no-lube-rendered-cards bucket.
8. Archive row in no_lube_card_renders: {template_id, asset_ids[], prompt,
   output_url, profile_kind, mint, multiplier, created_at}.
```

If step 4 fails (AI error / rate limit / content block): use the base composite from step 3 as the final card. **No more text-only fallback when an image was expected.**

### B3. Orchestrate flow change (milestone-first)

Current order: compose → check eligibility → render. New order:

```
1. Compute multiplier from baseline.
2. Milestone gate: floor(ratio) > prev_milestone? If no → skip, no compose, no render.
3. If yes → branch on channel:
     - PRIVATE template: ticker, CA short, multiplier, called/peak MC, "PREMIUM INSIDERS" header
     - PUBLIC template:  ticker, CA short, multiplier, entry/now MC, channel name header (e.g. "솔라나 펌핑 파티"), CTA URL if show_url=true
4. Render card (B2) for the matching template.
5. Compose text body via existing no-lube-compose.
6. Push to telegram with the rendered card + text caption.
```

Private and public get **distinct templates** and **distinct field sets** (matches your two screenshots).

### B4. Strict-text instructions to AI

Edit prompt now includes a hard preface:

> "The following text strings are already rendered on the base image. DO NOT redraw, modify, translate, or overlap them: `$PAYNE`, `BCa34u…W5pump`, `2X`, `$103k`, `$205k`. Do not add any other text."

Combined with edit-mode (vs generate-from-scratch) this eliminates the misspell-ticker problem without a QA loop.

### B5. Validation hard-stop

`no-lube-orchestrate` will refuse to proceed when `entry_market_cap` or `current_mcap` is null/0. Returns `{skipped: true, reason: 'missing_mcap_invariant'}`. No partial cards ever rendered.

### B6. Misc cleanups in `no-lube-render-card`

- Fix language pool query bug (OR clause currently always matches universal because of `language.is.null` AND wrong escape).
- Wire `last_used_at` + add `times_used` counter (replaces the broken `rpc('increment')`).
- Remove "no URL / no CA" hard rule. CA = small footer always-on by default; URL = controlled by template `show_url`.

## C. Admin UI changes

`src/components/admin/` No-Lube panel gets a new top-level tab:
```
[ Profiles ] [ Templates (NEW) ] [ Assets ] [ Recent Sightings ] [ Archive (NEW) ]
```
- **Templates**: per-profile/language template manager described in B1.
- **Archive**: filterable table of `no_lube_card_renders` — thumbnail, profile, mint, multiplier, asset_ids, prompt, created_at, "regenerate" button.

## D. Out of scope this round

- New aspect ratios beyond 1024x640 landscape (schema supports it; UI later).
- Video cards.
- Auto-translation of fixed text (templates already per-language).

## Technical notes

Files touched:
- migration: re-enable `insiders-pipeline-orchestrator-15m`; create `no_lube_card_templates`, `no_lube_card_renders` (with GRANTs + RLS); add `times_used`, `last_used_at` columns to `no_lube_assets` if missing.
- new edge function `no-lube-compose-card` (the deterministic compositor in B2) using `imagescript` (PNG ops) + a small JPEG EXIF writer. Replaces direct calls to `no-lube-render-card` from the orchestrator.
- edit `no-lube-orchestrate/index.ts` — milestone-first ordering (B3), mcap invariant (B5), pass `profile_kind` into compositor.
- edit `no-lube-render-card/index.ts` — language query fix, last_used wiring, drop "no URL/CA" rule, strict-text preface.
- new admin React components: `NoLubeTemplateManager.tsx`, `TemplateSafeZoneEditor.tsx`, `NoLubeArchivePanel.tsx`.

Awaiting "Plan Approved" before touching code.
