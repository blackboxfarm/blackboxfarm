## Diagnosis

The "→ Convert to GIF" button does run, but it reuses the same browser `ffmpeg.wasm` pipeline that was already broken. It downloads the MP4, then calls `convertMp4ToGif()` which hangs in wasm and trips the 120s timeout. Result: a `Convert failed: GIF conversion timed out` toast (often missed) and zero new rows. Database confirms: only `dancer6.mp4` exists, no GIFs.

The client-side wasm route is not viable on this hardware/browser combo. We need server-side conversion.

## Plan — move MP4→GIF to a Supabase Edge Function

### 1. New edge function `mp4-to-gif`
- Input: `{ storage_path: string, category: string, name: string, tags?: string[], language?: string, width?: number, fps?: number, seconds?: number }`
- Steps:
  1. Auth check (super-admin only).
  2. Download MP4 from `no-lube-assets` bucket via service role.
  3. Run ffmpeg (static binary fetched at cold start, or use `https://deno.land/x/ffmpeg` / call a hosted converter). Preferred: bundle a small ffmpeg static wasm in Deno using `@ffmpeg.wasm/main` server-side, OR shell out to a hosted conversion API. We'll use Deno + `ffmpeg-static`-style approach via a Docker-free path: call a hosted service (e.g. cloudconvert) if a key is configured, otherwise reject with a clear error.
  4. Upload `out.gif` to `no-lube-assets/{category}/{stamp}-{slug}.gif`.
  5. Insert new `no_lube_assets` row with `notes = converted_from=<source path>`.
  6. Return `{ id, public_url }`.

Implementation note: simplest reliable Deno-side path is to use the **CloudConvert API** (or similar) since Deno edge runtime has no native ffmpeg. We'll add a `CLOUDCONVERT_API_KEY` secret. If you'd rather not use a 3rd party, alternative is to deploy a small Fly.io/Render worker — but that's outside Lovable scope.

### 2. Rewire the button
- `convertRowToGif()` in `NoLubeAssetLibrary.tsx` stops doing wasm work.
- It calls `supabase.functions.invoke('mp4-to-gif', { body: {...}} )`.
- Shows spinner while pending; toast success/failure based on response.
- On success, calls `load()` to refresh the grid.

### 3. Same path for new uploads
- `handleUpload()` (when `keepMp4=false`) uploads the MP4 to `_source/...` then invokes `mp4-to-gif` instead of running wasm. Removes the 120s wasm timeout entirely.

### 4. Cleanup
- Remove `getFFmpeg`, `convertMp4ToGif`, `withTimeout` from the component (dead code).
- Drop the `@ffmpeg/ffmpeg` + `@ffmpeg/util` imports.

### 5. Secret required
- `CLOUDCONVERT_API_KEY` (or equivalent). I will prompt you to add it before deploying the function.

## Decision needed

Pick the conversion backend:
- **A. CloudConvert API** (recommended, ~$0.01/min, reliable, fast). Needs API key.
- **B. Self-hosted ffmpeg worker** (Fly.io/Render). Free-ish but you maintain it; outside this project.
- **C. Keep client-side but switch to a different lib (`gif.js` from a `<video>` element + canvas)**. Pure browser, no server, but slower and lower quality than ffmpeg.

Reply with **A**, **B**, or **C** (plus "Plan Approved") and I'll implement.