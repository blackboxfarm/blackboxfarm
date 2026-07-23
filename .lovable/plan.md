# Chart Thumbnails for Alpha Watch + SMS

## Goal
Generate a branded 1-minute-candle chart thumbnail (1200×628) for each alpha-detected token, display it in the Alpha Watch tab, and attach it to the SMS as an MMS MediaUrl.

## Pieces

### 1. New edge function: `chart-thumb`
- Route: `GET /chart-thumb?mint={mint}&tf=1m`
- Uses Browserless (already connected) to screenshot a headless page that embeds GeckoTerminal's 1m chart at fixed 1200×628, dark theme, no swaps/info chrome.
  - Fallback URL: DexScreener embed if GT has no pool.
- Uploads the PNG to Supabase Storage bucket `chart-thumbs` under `{mint}/{unix_minute}.png` (cached ~5 min).
- Returns `{ url: publicUrl }` (or 302 redirects to it).
- Public bucket so Twilio can fetch the MediaUrl.

### 2. Storage
- Create public bucket `chart-thumbs` (5MB limit, image/png).

### 3. Wire into `alpha-dev-detector`
- After building the SMS body, call `chart-thumb` for the new mint, get `publicUrl`.
- Pass it as `MediaUrl` on the Twilio `/Messages.json` POST (MMS).
- Store the URL on the `alpha_paper_trades` row (new column `chart_thumb_url text`).

### 4. Alpha Watch UI (`src/pages/InsidersRecaps.tsx`)
- Add a small thumbnail column (or hover preview) in the Alpha Watch table showing `chart_thumb_url`. Click to open full DexScreener chart.

## Migration
- `alter table alpha_paper_trades add column chart_thumb_url text;`
- Create storage bucket via `storage_create_bucket` (public).

## Notes
- MMS to Canadian numbers via Twilio works with public https MediaUrl.
- If Browserless fails, SMS still sends without MediaUrl (fail-open).
