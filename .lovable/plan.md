## Goal
Let the Asset Library accept MP4 uploads and auto-convert them to animated GIFs so they slot into the existing image-based asset flow (No Lube composer, previews, etc.).

## Approach

**1. Frontend (`NoLubeAssetLibrary.tsx`)**
- Widen the file input `accept` to `image/*,video/mp4`.
- On submit, detect MP4 (by mime/extension). If MP4:
  - Upload the original MP4 to `no-lube-assets/_source/<path>.mp4` (kept as source of truth).
  - Call a new edge function `mp4-to-gif` with the storage path.
  - Receive the generated GIF's public URL + storage path back.
  - Insert the `no_lube_assets` row pointing `public_url`/`storage_path` at the GIF (so existing render pipeline keeps working), with `notes`/metadata recording the original MP4 path.
- Show a "Converting…" spinner state during the call.
- For images, behavior is unchanged.

**2. New edge function `supabase/functions/mp4-to-gif/index.ts`**
- Input: `{ sourcePath: string, targetName: string, maxWidth?: number, fps?: number, maxSeconds?: number }`.
- Downloads the MP4 from the `no-lube-assets` bucket via service-role client.
- Converts to GIF using a WASM ffmpeg build (`@ffmpeg.wasm/main` via esm.sh) with a two-pass palette filter for quality:
  - `palettegen` → `paletteuse`, scale to `maxWidth` (default 480px), `fps` default 12, cap to `maxSeconds` default 6s to keep files small.
- Uploads the resulting `.gif` to `no-lube-assets/<category>/<name>.gif`.
- Returns `{ gifPath, gifUrl, sizeBytes, durationSec }`.
- Standard CORS + `withRunLog` wrapper, follows the zero-tolerance `assertDbWrite` policy if any DB writes are added (none planned beyond the frontend insert).

**3. Storage / config**
- Confirm `no-lube-assets` bucket allows `video/mp4` and `image/gif` content types (Supabase storage buckets accept any mime by default unless restricted — verify in migration if a mime allowlist exists; add migration to relax if needed).

**4. QA**
- Upload a short MP4 from the Asset Library UI, verify a GIF card appears with animated preview.
- Confirm the original MP4 is retained under `_source/` for future re-encodes.

## Out of scope
- No changes to the composer's prompt logic — it keeps consuming `public_url` (now a GIF).
- No batch re-encode of existing assets.

## Open question
- Default GIF settings: **480px wide, 12 fps, max 6 seconds**. OK, or do you want larger/longer (e.g. 640px / 15fps / 10s — bigger files)?
