---
name: Intel briefing image pipeline integrity
description: Filename collision guards and transactional EXIF rebrand to prevent hero/inline image swaps
type: feature
---
**Why:** Article #10 lost its hero and 3/4 inline images during EXIF rebrand on May 7 2026. Two failure modes were possible:
1. `Date.now()-{adj}-{noun}-{hero|inline}.jpg` collisions — 15×15 word dictionary + same-millisecond uploads + `upsert:true` = silent overwrite.
2. `intel-exif-rebrand` swallowed per-image errors as 207 with no admin alert, and stamped `exif_branded_at` even on partial failure.

**Guards now in place:**
- `IntelBriefingsManager.handleGalleryCropComplete`: filename = `${Date.now()}-${rand6}-${imageName}.jpg`, `upsert:false` so storage rejects collisions.
- `intel-exif-rebrand`:
  - Only stamps `exif_branded_at` when EVERY image succeeded (partial → re-runs next sweep).
  - SMS-alerts admin via `sendAdminSms` on any per-image failure.
  - Self-audit: if `featured_image_url` also appears as an inline-markdown URL → flag as `heroCollision` and alert (signature of a past overwrite).
