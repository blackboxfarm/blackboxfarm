## Goal

For 2X / 3X / 4X milestone banners, stop using stale or AI-invented images. Always source the **real** mint PFP, cache it, and additionally surface the DexScreener banner (and paid-DEX flag) so we can later overlay a 50X/100X badge strip.

Also fix the markdown hyperlinks that aren't rendering in Telegram.

---

## Changes

### 1. Always pull a fresh mint image, persist to DB

`supabase/functions/no-lube-compose/index.ts`
- Keep current Helius → DexScreener → cache resolution order.
- When `tokenImageUrl` resolves AND the value differs from `holders_intel_seen_tokens.image_uri` (or that column is null), upsert it onto `holders_intel_seen_tokens.image_uri`. This guarantees a freshly-validated, canonical URL is stored per mint.
- Return both `token_image_url` and `banner_url` (see step 2) in the response payload so orchestrate can forward them.

### 2. Fetch + cache DexScreener banner and paid-DEX flag

`supabase/functions/no-lube-compose/index.ts`
- Reuse `_shared/dexscreener-banner.ts` (`fetchDexBanner`) to pull `info.header`. Also detect `boosts.active > 0` → `has_paid_dex: true`.
- Cache order: read `holders_intel_seen_tokens.banner_url` first; if empty, fetch live; if found, write back to DB.
- Surface `banner_url`, `banner_source`, and `has_paid_dex` in the compose JSON response (`vars` + top-level).

### 3. Pipe banner info through orchestrate → compose-card

`supabase/functions/no-lube-orchestrate/index.ts`
- Forward `token_image_url`, `banner_url`, `has_paid_dex` from `probe.json.vars` into `composeCardUrl` body.
- **Critical fix:** if `compose-card` fails, do NOT fall back to AI `render-card` for milestone posts (that's what produces the "made-up" images). Instead, surface the error and skip the post so we never push an invented image. The user can sort positioning later — we just need real assets.

`supabase/functions/no-lube-compose-card/index.ts`
- Accept new optional inputs: `banner_url`, `has_paid_dex`.
- Persist behavior unchanged: mint PFP still drawn into `mint_pfp` zone using `token_image_url`.
- Return both fields in the response payload (for future overlay step the user will tune visually).

### 4. Markdown hyperlink syntax check

The user reports `[text](url)` links not rendering. I'll grep the Telegram message templates rendered by `no-lube-compose` for cases where backtick template literals break Markdown escaping (e.g. unescaped `_`, `(`, `)` inside URLs, or accidental backtick wrapping turning a link into inline code). Fix specific instances found; no behavioral change beyond escape cleanup.

### 5. NOT in scope (deferred until images are correct)

- Actually drawing the 50X/100X orange badge over the banner strip.
- Drawing advert badge in the opposite corner.
- Choosing exact percentage/positioning.

These come after the user confirms the correct source images are being pulled.

---

## Files Touched

- `supabase/functions/no-lube-compose/index.ts` — banner fetch + persist mint image + paid flag
- `supabase/functions/no-lube-orchestrate/index.ts` — forward fields, kill AI fallback for milestones
- `supabase/functions/no-lube-compose-card/index.ts` — accept + return banner fields
- Possibly one or two Telegram message string lines for markdown link escaping

No DB schema changes — `holders_intel_seen_tokens` already has `image_uri` and `banner_url`.

Awaiting **Plan Approved**.