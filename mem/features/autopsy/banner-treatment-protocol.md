---
name: Autopsy Banner Treatment Protocol
description: Standardized BlackBox Autopsy hero/OG image generation — coroner collage frame + red -45° BLACKBOX AUTOPSY stencil over original DexScreener banner
type: feature
---
Every Token Autopsy MUST have a treated hero/OG banner generated via the locked protocol in `docs/autopsy-image-protocol.md`.

**Source:** Pull `pairs[0].info.header` from DexScreener for the mint (1500×500). Save URL into `AutopsyEntry.sourceBanner`.

**Treatment (v2 — DECORATE, DO NOT COVER):** Use `google/gemini-3-pro-image-preview` via the AI Gateway in EDIT mode (pass the source banner as input). Output 1536×512 jpg to `public/autopsies/<slug>-autopsy-v2.jpg`. The original banner MUST remain fully visible and identifiable — the treatment is a transparent forensic overlay framing the EDGES and CORNERS only. Center 60% of the image is untouched.

**Required visual elements (corners/edges only, 60–75% opacity):** CASE FILE card (TL), CAUSE OF DEATH toe-tag (TR), DEATH CERTIFICATE clipboard + magnifier + scalpel (BL), barcode + EVIDENCE stamp (BR). Scattered red skull stamps and blood-spatter flecks in dead corners. ONE diagonal strip of yellow POLICE LINE / DO NOT CROSS tape across a single bottom corner. Bold red military stencil "BLACKBOX AUTOPSY" rotated -45° placed in the BOTTOM-RIGHT QUADRANT only — never centered.

**HARD BANS:** No green blob/mascot/creature. No central artwork replacement. No covering of the source ticker/title text. No centered AUTOPSY stencil over the subject.

**Wire-up:** Set `heroImage` + `sourceBanner` in `src/data/autopsies.ts`. `AutopsyArticle.tsx` auto-injects og:image, twitter:image, and JSON-LD Article.image. `Autopsies.tsx` listing auto-renders as card thumbnail.

**Why:** Visual consistency across X/Telegram/Discord shares. Series instantly identifiable as BlackBox forensic artifact.
