## Goal
Let any user (and especially Pro users) capture the **visible Bubble Map area** — works for both the **Classic ForceGraph view** and the **Schematic xyflow view** — into a PNG, upload it to a public storage URL, and share to X/Telegram with custom commentary. Reuses your existing share-card infrastructure (`generate-share-card-satori`, `share-card-page`, `social-gallery` bucket, `post-share-card-twitter`).

---

## Why this is straightforward in your stack
- **ForceGraph2D** (Classic view) — the underlying canvas is already a real `<canvas>` element. Direct `canvas.toDataURL('image/png')` works. No extra library needed for that view.
- **xyflow / React Flow** (Schematic view) — supports `getNodesBounds` + `getViewportForBounds` + the `html-to-image` library (officially recommended by xyflow docs) to rasterize the SVG/HTML graph.
- You already have public Supabase Storage buckets (`social-gallery`, `intel-images`, `OG`) with `getPublicUrl()` flows in production.
- You already have a tweet/X intent share flow (`shareToTwitter`) and a server-side autoposter (`post-share-card-twitter`).

---

## Architecture

### 1. New shared util: `src/utils/captureBubbleMap.ts`
Two strategies behind one API:

```ts
captureBubbleMap({
  view: 'bubble' | 'schematic',
  containerRef,         // for schematic
  forceGraphRef,        // for bubble
  width, height,
  watermark?: { tokenSymbol, ca, grade }   // overlay drawn before upload
}): Promise<Blob>
```

- **Bubble view**: pull `forceGraphRef.current` → its internal canvas → composite with a header strip drawn via `OffscreenCanvas` (token symbol, CA, healthGrade, "blackbox.farm/holders" footer, gold border for brand consistency) → return PNG Blob.
- **Schematic view**: use `html-to-image` `toPng()` against the React Flow wrapper element (the `.react-flow` root). Add the same header/footer overlay via a hidden DOM wrapper or a post-process canvas.
- Output is always **1200×675** (Twitter/OG safe) — we letterbox or cover-fit the captured area.

### 2. New dependency
- Add `html-to-image` (~12 KB, pure browser, no Node) — required for the Schematic/SVG view. The Bubble view does not need it.

### 3. New component: `src/components/bubble-map/SnapshotShareDialog.tsx`
A modal opened from a new "📸 Snapshot & Share" button placed in the Bubble Map toolbar (next to the existing view-mode toggle, visible in both Bubble and Schematic modes; hidden in 3D for now to avoid WebGL readback complications).

Dialog flow:
1. **Preview pane** — shows the captured PNG inline.
2. **Commentary textarea** — pre-filled with a smart default:
   `🔍 ${ticker} — Grade ${grade} · ${realHolders} real holders\nMapped on @HoldersIntel\nblackbox.farm/holders?token=${ca}`
3. **Visibility toggle**:
   - "Public link only" (just upload + copy URL)
   - "Share to X" (opens `twitter.com/intent/tweet` with text + URL)
   - "Share to Telegram" (opens `t.me/share/url`)
4. **Re-capture** button (in case user pans/zooms first).
5. **Download PNG** button.

### 4. New edge function: `upload-bubble-snapshot`
Why server-side instead of a direct browser upload?
- Anonymous (free-tier) users still need to share but shouldn't get write access to the bucket.
- Lets us stamp a server-signed filename, enforce per-user rate limits (3/day Free, unlimited Pro — matches `mem://features/bubble-map/access-and-tiers`), and log to a `bubble_snapshots` table for analytics.

Function:
- Accepts `{ pngBase64, tokenAddress, commentary?, viewMode }`.
- Validates auth + rate limit.
- Uploads to `social-gallery/bubble-snapshots/{userId}/{timestamp}-{ticker}.png`.
- Inserts row into new table `bubble_snapshots(id, user_id, token_address, view_mode, public_url, commentary, created_at)` — uses `assertInsert` per zero-tolerance silent-fails rule.
- Returns `{ publicUrl, snapshotId, shareUrl }` where `shareUrl` is a friendly path like `share.blackbox.farm/bubble/{snapshotId}` proxied via the existing Cloudflare `blackbox-og-router` worker so the link itself unfurls beautifully in X/TG/Discord.

### 5. New OG endpoint: extend `share-card-page` (or add `bubble-share-page`)
`/bubble/{snapshotId}` returns minimal HTML with:
- `og:image` = the uploaded PNG
- `og:title` = "${ticker} — Holder Mesh · Grade ${grade}"
- `og:description` = the user's commentary (sanitized)
- A meta-refresh / link back to `/bubblemap?token=${ca}` so humans land on the live map.
This is the same pattern already used for `/intel-share`.

### 6. New table migration
```sql
create table public.bubble_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  token_address text not null,
  view_mode text not null check (view_mode in ('bubble','schematic')),
  public_url text not null,
  commentary text,
  created_at timestamptz default now()
);
alter table public.bubble_snapshots enable row level security;
-- public read (so OG endpoint can resolve), insert via edge function only (service-role)
create policy "Public can read snapshots" on public.bubble_snapshots
  for select using (true);
```
Per-user rate limit enforced inside the edge function (not via RLS).

### 7. UI placement
In `PublicBubbleMap.tsx`, in the toolbar row that already contains the view-mode toggle (`Sun / Orbit / Box / LayoutTemplate` icons), add a `Camera` icon button → opens `SnapshotShareDialog`. Disabled when `viewMode === '3d'` with a tooltip "Snapshot available in Bubble & Schematic views" (3D WebGL readback can be added later if you want).

---

## Tier behavior (matches existing mesh memory)
| Tier | Snapshots/day | Watermark | "Powered by" footer |
|------|---------------|-----------|---------------------|
| Anon | 1 | Yes (gold "TRY PRO") | Yes |
| Free | 3 | Yes (subtle) | Yes |
| Pro  | Unlimited | Optional toggle | Optional |

---

## Files to create / edit
**Create**
- `src/utils/captureBubbleMap.ts`
- `src/components/bubble-map/SnapshotShareDialog.tsx`
- `supabase/functions/upload-bubble-snapshot/index.ts`
- `supabase/migrations/<ts>_bubble_snapshots.sql`
- (Optional) `supabase/functions/bubble-share-page/index.ts` — or extend `share-card-page`

**Edit**
- `src/components/bubble-map/PublicBubbleMap.tsx` — add Camera button in toolbar
- `src/components/bubble-map/BubbleMapSchematic.tsx` — expose container ref via `forwardRef` so the capture util can target the React Flow root
- `package.json` — add `html-to-image`
- `supabase/config.toml` — register new function(s)

---

## Risks / things I'll watch for
1. **CORS / tainted canvas** — any token logos loaded from third-party CDNs without `crossOrigin="anonymous"` will taint the canvas and block `toDataURL`. Mitigation: route external images through your existing image proxy or fall back to a text-only badge in the overlay.
2. **Very large meshes** — 200+ nodes at 1200×675 produces ~200 KB PNGs, fine for `social-gallery`. We cap to 500 KB and re-encode at quality 0.85 if larger.
3. **ForceGraph reheats** — capture is taken from a paused frame (`graphRef.current.pauseAnimation()` → capture → `resumeAnimation()`).
4. **Rate-limit table grows** — share `bubble_snapshots` retention with the existing 30-day cleanup cron in `database-housekeeping`.

---

## Out of scope (deliberate)
- 3D view capture — defer until requested.
- AI-generated commentary — easy follow-up, but first ship the human-driven flow.
- Direct Instagram/Facebook posting — X + Telegram + copyable public URL covers 95% of use right now.

Once you approve I'll implement in this order: migration → edge function → util → dialog → toolbar wiring → docs note in `mem://features/bubble-map/`.