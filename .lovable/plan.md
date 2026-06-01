Diagnosis:
- The original MP4 is uploading successfully to `_source/...`.
- The conversion is not completing afterward: there is no GIF upload request and no DB insert for the new asset.
- Existing earlier rows `dancer1` and `dancer2` are still MP4 rows, meaning the previous path likely inserted raw MP4s before conversion was added.
- The current browser-side `ffmpeg.wasm` conversion can hang silently or take too long, leaving the UI stuck on “Converting MP4 → GIF…” with no final result.

Plan:
1. Add conversion timeout + visible failure
   - Wrap `convertMp4ToGif()` with a timeout so it cannot spin forever.
   - If conversion fails/times out, show a clear toast and reset the button state.
   - Do not insert a broken MP4 row as a GIF asset.

2. Add progress/debug status in the UI
   - Show stages: uploading source MP4, loading converter, converting, uploading GIF, saving asset.
   - Add console logs only around conversion failures/status so future stuck reports are diagnosable.

3. Make conversion faster and safer
   - Lower emergency defaults to 240px, 8fps, 3s for admin asset previews unless changed later.
   - Use simpler GIF settings to reduce wasm freeze risk.

4. Clean up stuck/legacy rows
   - Identify current `no_lube_assets` rows whose `storage_path` ends in `.mp4`.
   - Either remove them from the asset library or mark/repair them, so the library only contains real image/GIF assets.

5. Optional fallback if browser GIF still fails
   - Keep the uploaded MP4 under `_source/` and add a visible “source saved, conversion failed” message, so nothing disappears silently.

Expected result:
- MP4 uploads either produce a real `.gif` row in the library or fail visibly with a reason.
- No more indefinite “Converting…” state.
- Existing MP4 entries are cleaned up so the library reflects real GIF/image assets only.