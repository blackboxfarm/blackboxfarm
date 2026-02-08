
Goal
- Fix X/Twitter link previews for Token X Dashboard marketing links so the preview image reliably appears immediately after a composite rebuild.

What’s happening (root cause)
- The Token X Dashboard generates a unique share URL by adding `v=comp_<timestamp>` to the *page* URL (holders-og).
- However, `holders-og` currently outputs a fixed `og:image` URL (ex: `.../token_composite_5an34GbK.png`) that does NOT include the `v` cache-buster.
- X/Twitter can cache the image fetch independently of the page URL. If the first fetch failed (or fetched an older/blank file), changing only the page URL often does not force X to refetch the image because the image URL is unchanged.
- Evidence from deployed logs: `holders-og` is being requested by Twitterbot and is serving `token_composite_5an34GbK.png`. So OG tags are being read; the break is at “image retrieval/caching”.

Constraints to preserve
- Do not touch the standard sharing components/logic on the public `/holders` page (per your requirement). All changes stay inside the marketing-only `holders-og` flow and the admin Token X Dashboard.

Phase 1 (fast, low-risk fix): propagate the cache-buster into og:image
1) Update edge function: `supabase/functions/holders-og/index.ts`
   - After selecting `ogImage`, compute `ogImageForMeta`:
     - If a `v` parameter exists on the request URL, append it to the image URL as a query param (so every new “draft link” produces a new image URL too).
     - Handle both cases:
       - If `ogImage` already has query params (DexScreener banners often do), append with `&v=...`
       - Otherwise append with `?v=...`
   - Use `ogImageForMeta` for:
     - `og:image`
     - `og:image:secure_url`
     - `twitter:image`
     - `itemprop="image"`
   - Optional but recommended hardening:
     - Trim symbol/name strings (your output currently shows `$ NEO` with a leading space).
     - Only include `og:image:type`, width, height when we are certain (or remove `og:image:type` entirely). Mismatched type/size metadata can cause some crawlers to behave oddly.

2) Add debug headers (helps you verify instantly without guessing)
   - In the same function response headers, add:
     - `X-Debug-OG-Source: composite|banner|default|versioned`
     - `X-Debug-OG-Image: <last 80 chars of URL>`
   - This lets you quickly confirm what the function picked when testing with a Twitterbot UA.

Why this should fix it
- Your Token X Dashboard already generates a fresh `v=comp_<timestamp>` per click.
- After this change, that same `v` will also make the image URL unique, which is the key requirement to defeat X/Twitter’s aggressive image caching.

How you’ll test (end-to-end)
1) In `/super-admin` → Token X Dashboard:
   - Click the composite rebuild (Layers icon) for the token.
2) Click the “copy/open X” action (currently the Copy icon) again to generate a new link.
3) Confirm in X composer that the card now shows an image (not just title/description).
4) Optional verification:
   - Hit the deployed function with a Twitterbot UA and confirm `og:image` includes `?v=comp_...` (and that `X-Debug-OG-Source` shows `composite`).

Phase 2 (UI clarity fix): stop the “POST doesn’t exist” confusion
3) Update admin UI: `src/components/admin/TokenXDashboard.tsx`
   - Change the icon-only action button into a labeled button so it’s discoverable and matches what we say in instructions.
   - Recommended label: “POST” or “Post to X” (your call), with a tooltip: “Copies text and opens X compose”.
   - Keep the behavior identical:
     - copies to clipboard
     - opens the intent URL in a new tab
     - shows “Copied” state for a few seconds

Phase 3 (only if needed): make image delivery bulletproof via an image-proxy edge function
If X still refuses to load images from Supabase Storage (rare, but can happen due to bot/CDN behavior):
4) Create a new edge function `supabase/functions/holders-og-image/index.ts`
   - Query the same tables and choose the same image priority as `holders-og`.
   - Fetch the chosen image server-to-server.
   - Stream bytes back with:
     - `Content-Type` set from upstream (fallback `image/png`)
     - `Cache-Control: public, max-age=300`
5) Update `holders-og` to point `og:image` to `https://og.blackbox.farm/holders-og-image?token=...&v=...`
   - This ensures X fetches the image from the same OG domain and avoids any Storage/CDN bot quirks.

Expected outcome
- Immediately after a rebuild + click to generate a new draft link, X composer shows the updated composite image.
- The “what button do I click?” confusion is removed by a clearly labeled action.

Files involved
- Must change:
  - `supabase/functions/holders-og/index.ts`
- Recommended change:
  - `src/components/admin/TokenXDashboard.tsx`
- Optional (only if Phase 1 doesn’t fully solve it):
  - `supabase/functions/holders-og-image/index.ts` (new)

Rollback plan
- If anything unexpected happens, revert `holders-og` to using the raw `ogImage` without query param injection (one small diff), and keep the previous behavior.
