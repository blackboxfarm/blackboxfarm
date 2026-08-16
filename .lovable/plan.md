# /brand — BlackBox Farm Brand Content Studio

Port the framework BestBaliSpas uses (a single `/brand` route backed by a token file, an SVG mark library, and canvas-based export helpers) onto BlackBox Farm's cyan-on-black / gold aesthetic.

## What you get at `/brand`

1. **Chosen identity panel** — the locked BlackBox mark + wordmark preview, with switchable background (Void black / Cyan grid / Gold), switchable tagline, and one-click export: SVG, PNG 256/512/1024, transparent PNG.
2. **Logo directions** — 6 original SVG marks drawn in code (no AI images), each with a short story and "best for" note, previewed on black or on cyan, each downloadable as SVG/PNG.
3. **Colour system** — click-to-copy swatches for every brand colour with its CSS token name and role, plus the signature gradient strip.
4. **Typography** — display + body specimen cards with weight/tracking guidance.
5. **Banner generator** — composes ready-to-post PNGs on canvas at real sizes: OG card 1200×630, X header 1500×500, square 1080×1080, Telegram/email banner 1200×300. Uses the selected background + tagline.
6. **Do / Don't usage rules** and a **favicon & avatar set** showing every mark at 64/32/16px.

## Technical detail

- `src/lib/brand.ts` — literal hex exports mirroring `src/index.css` tokens (cyan `--primary`, gold `--gold`, void background, card, muted) plus `BRAND_PALETTE` and `BRAND_TYPOGRAPHY` metadata. `index.css` stays authoritative for app UI; these literals exist only so downloaded files carry real colours.
- `src/components/brand/logos.tsx` — 6 inline SVG marks (`viewBox 0 0 64 64`, `size`/`inverse` props) + `Wordmark`, exported as `LOGO_VARIANTS`.
- `src/lib/brandExport.ts` — `triggerDownload`, `serializeSvg`, `markToPng(svg, size, background)`, `BANNER_PRESETS`, `bannerToPng(...)`. Pure client-side canvas, no edge function, no DB.
- `src/pages/Brand.tsx` — the page, wrapped in `SiteLayout`, with SEO title/description/OG meta.
- Route `/brand` added to `src/App.tsx`. Not added to the main nav (internal tool) — say the word if you want it in the menu.
- No backend, no migrations, no API credits consumed.

## Scope guardrails

Frontend only. Nothing in `index.css`, the header logo, or the favicon changes until you pick a mark and tell me to wire it site-wide.
