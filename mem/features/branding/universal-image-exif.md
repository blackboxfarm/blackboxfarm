---
name: Universal Image EXIF Branding
description: Every uploaded/generated image (autopsy banners, holders-intel banners, article hero+inline) must be stamped with BlackBox Farm EXIF/copyright via _shared/exif-rebrand.ts (rebrandImage) before storage upload
type: feature
---
Every image we produce or upload MUST carry branded EXIF/XMP (Title, Author, Copyright, Software, Keywords, Comment) so Windows/macOS/Twitter all see BlackBox Farm ownership.

Pipelines & where rebrand lives:
- `autopsy-banner-overlay` — rebrands AI-edited JPEG before bucket upload.
- `autopsy-banner-stamp-pill` — re-rebrands AFTER `encodeJPEG` (ImageScript strips metadata), this is the FINAL overwrite, so without re-stamping the banner lands EXIF-less.
- `holders-intel-banner-decorate` — rebrands AI-edited JPEG before upload.
- Article hero + inline images: client `stripExifAndBrand` injects JPEG COM, then `intel-exif-rebrand` sweep upgrades to full EXIF/XMP and stamps `exif_branded_at`.

Rule for any NEW image pipeline: import `rebrandImage` from `_shared/exif-rebrand.ts` and stamp bytes immediately before `storage.upload(...)`. If a downstream step re-encodes (ImageScript, canvas, sharp), re-stamp again at that step. Going-forward only — no backfill required.
