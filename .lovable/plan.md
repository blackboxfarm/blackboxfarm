## Goal
Stop the mobile top nav from horizontally scrolling. Wrap the tabs onto 2 rows and tighten padding on small screens. Desktop layout unchanged.

## Change (single file)
`src/components/layout/SiteLayout.tsx` — the `<nav>` at line 157.

**Mobile (<md):**
- Switch from `flex` + `overflow-x-auto` + `whitespace-nowrap` to `flex-wrap` (allows 2+ rows).
- Reduce per-tab padding from `px-4 py-2.5` to `px-2 py-1.5` and `text-xs`.
- Reduce gap from `gap-1` to `gap-0.5`.
- Remove the scroll-hint `ChevronRight` overlay on mobile (no longer needed since nothing scrolls).

**Desktop (md+):**
- Keep current `md:px-4 md:py-2.5 md:text-sm md:flex-nowrap md:gap-1` behavior — same look as today.

## Result
On phones: tabs wrap to 2 (or 3 if very narrow) compact rows, no side-scroll, no arrow hint.
On desktop: identical to today.

No other files touched. Awaiting "Plan Approved".