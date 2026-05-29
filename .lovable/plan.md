# Plaques under text zones in No-Lube cards

## What changes visually
- Every text zone gets an optional **plaque** drawn behind the text (rounded rect, semi-opaque fill, optional 1–2px border) so lettering stops getting eaten by the background art.
- Plaque shape per zone:
  - `ticker`, `ca`, `show_url` → **lengthwise pill** (rounded, wide)
  - `entry_value`, `current_value` → **square** with border
  - `entry_label`, `current_label` → small pill matching the square's width above
  - `multiplier` → no plaque change (lives over character art already), just text fix
- Zones widened so the **full 44-char wallet address** fits in white at a readable size:
  - `ticker.w`: 500 → **820**
  - `ca.w`: 500 → **820**, height 30 → **44**, CA rendered in **full** (no `6…6` shortening) in white
- Multiplier text: `30X` → `30x` (small lowercase x kept proportional to the digits, ~70% the digit cap height, baseline-aligned).

## How plaques are configured
Extend `safe_zones[zone]` schema with optional plaque fields — backward compatible (any zone without them renders as today):
```
{ x, y, w, h, shape?,
  plaque?: {
    shape: 'pill' | 'rect',
    fill: '#000000',        // hex, alpha applied via opacity
    opacity: 0.55,
    pad_x: 18, pad_y: 8,    // plaque grows beyond text bbox
    radius: 999,            // 999 = full pill, else px
    border_color?: '#ffffff',
    border_width?: 0,
    text_color?: '#ffffff'  // overrides hard-coded color when set
  }
}
```
`drawTextInZone` is rewritten to: pick font size → measure rendered text → draw plaque rounded-rect first (filled + optional border) → composite text on top. Plaque is centered on the zone, sized to `text + pad_x*2 / text + pad_y*2`, clipped to zone bounds.

## Defaults seeded for new templates
`DEFAULT_SAFE_ZONES` in the Template Manager updated with the new widths and plaque presets so freshly uploaded templates look right out of the box. Existing templates keep their JSON until the admin edits them (they can paste the new JSON or hit a "Reset zones to default" button — already exists conceptually via the JSON textarea).

## Files touched
- `supabase/functions/no-lube-compose-card/index.ts`
  - New `drawRoundedRect(canvas, x, y, w, h, radius, fillRGBA, borderRGBA?, borderW?)` helper (pixel loop, alpha-blend; ImageScript has no native rounded-rect, so a small per-pixel routine using `Image.fill` rectangles + 4 corner masks).
  - `drawTextInZone` accepts plaque config, draws it before text, returns nothing.
  - Multiplier formatter: digits + lowercase `x` rendered as two separate `renderText` calls, x sized at ~0.7× and bottom-aligned to the digit baseline.
  - CA rendering: drop `caShort()` call when zone height ≥ 40 (full mint fits); render at size that exactly fits zone width.
- `src/components/social/NoLubeTemplateManager.tsx`
  - `DEFAULT_SAFE_ZONES` updated (widths, heights, plaque blocks).
  - `TplRow.safe_zones` type extended with optional `plaque` field.

## Out of scope (for now)
- Uploaded mid-layer PNG overlays with z-index. Not needed — computed plaques cover the legibility problem and stay responsive to text length. If you later want hero brand art (e.g., a stylized HIVEFORGE plate), we add a separate `overlay_layers[]` array with `{url, x, y, w, h, z}` in the same JSON.

## After deploy
Open the Luna Dusk template, paste the new default JSON (or I can write a one-shot migration to patch the existing 3–4 templates), regenerate a test card, you tweak colors/opacity from the JSON editor live.
