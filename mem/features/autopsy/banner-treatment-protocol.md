---
name: Autopsy Banner Treatment Protocol
description: Standardized BlackBox Autopsy hero/OG image generation — coroner collage frame + red -45° BLACKBOX AUTOPSY stencil over original DexScreener banner
type: feature
---
Every Token Autopsy MUST have a treated hero/OG banner generated via the locked protocol in `docs/autopsy-image-protocol.md`.

**Source:** Pull `pairs[0].info.header` from DexScreener for the mint (1500×500). Save URL into `AutopsyEntry.sourceBanner`.

**Treatment:** Use Lovable AI `standard` model, 1536×512 jpg, output to `public/autopsies/<slug>-autopsy.jpg`. Use the locked prompt template in the docs file — only `{{TOKEN_VISUAL_DESCRIPTION}}` is variable.

**Required visual elements:** Central original-banner subject preserved, coroner collage on edges (CASE FILE / CAUSE OF DEATH redacted reports, chalk outline, toe-tag, clipboard, scalpel, magnifier, red skull stamps, yellow DO NOT CROSS tape, blood spatter, EVIDENCE stamp, barcode), bold "BLACKBOX AUTOPSY" military stencil rotated -45° in blood-red with sprayed edges.

**Wire-up:** Set `heroImage` + `sourceBanner` in `src/data/autopsies.ts`. `AutopsyArticle.tsx` auto-injects og:image, twitter:image, and JSON-LD Article.image. `Autopsies.tsx` listing auto-renders as card thumbnail.

**Why:** Visual consistency across X/Telegram/Discord shares. Series instantly identifiable as BlackBox forensic artifact.
