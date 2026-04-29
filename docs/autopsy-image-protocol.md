# 🪦 BlackBox Autopsy — Banner Treatment Protocol

**Purpose:** Standardize the visual treatment of every Token Autopsy hero/OG image so the series is instantly recognizable as a BlackBox forensic artifact.

---

## Step 1 — Source the original token banner

Pull the live banner from DexScreener (authoritative source):

```bash
curl -s "https://api.dexscreener.com/latest/dex/tokens/<MINT>" \
  | jq -r '.pairs[0].info.header'
```

- Field: `pairs[0].info.header`
- Typical dimensions: **1500×500** (3:1 banner)
- Save the URL into `AutopsyEntry.sourceBanner` for provenance.
- If the token has no DexScreener banner, fall back to: pump.fun image, then Helius metadata `image`.

## Step 2 — Generate the autopsy treatment (v2 — DECORATE, DO NOT COVER)

The treatment is a **transparent forensic overlay** that decorates the EDGES and CORNERS of the original banner. The center 60% of the image must remain UNTOUCHED — the source ticker, mascot, and on-banner text must stay clearly identifiable.

Use **Lovable AI image EDIT** (not generate) with `google/gemini-3-pro-image-preview`, passing the downloaded source banner as the input image. Never call generate_image from scratch — that produces a full replacement, which is forbidden.

### Locked prompt template (v2)

> EDIT this exact image — DO NOT redraw, replace, or generate the central artwork. Preserve the original banner ({{TOKEN_VISUAL_DESCRIPTION}}) at full visibility. Treat this as a TRANSPARENT FORENSIC OVERLAY decorating the EDGES and CORNERS only.
>
> ABSOLUTELY DO NOT: add any blob/mascot/character/creature; cover the central 60% of the banner; replace or repaint the source banner; place the AUTOPSY stencil over the central subject.
>
> DO ADD as semi-transparent decorative elements layered ONLY around the edges and corners (60–75% opacity, banner shows through):
> - Top-left: vintage CASE FILE coroner report card (faded, redacted black bars)
> - Top-right: CAUSE OF DEATH toe-tag report (aged paper)
> - Bottom-left: clipboard with DEATH CERTIFICATE, magnifying glass, scalpel
> - Bottom-right: barcode + small EVIDENCE red rubber-stamp
> - Scattered red skull stamps (small, ~60% opacity) in the dead corners
> - One diagonal strip of yellow POLICE LINE / DO NOT CROSS tape across ONE bottom corner only
> - A few red blood-spatter flecks around the edges
> - Bold red military stencil "BLACKBOX AUTOPSY" rotated -45°, placed in the BOTTOM-RIGHT QUADRANT only, sprayed/distressed edges
>
> Final output 1536×512.

### Locked parameters

| Parameter | Value |
|---|---|
| `model` | `google/gemini-3-pro-image-preview` (image EDIT mode) |
| Input image | downloaded source banner (NOT a URL — local file) |
| `width` | `1536` |
| `height` | `512` |
| Aspect ratio target | **3:1** (banner) |
| Output format | `.jpg` |
| Output path | `public/autopsies/<slug>-autopsy-v2.jpg` |

### Variable injection

Replace `{{TOKEN_VISUAL_DESCRIPTION}}` with a 1-sentence factual description of what's already on the source banner (e.g. "four yellow stick-figure scenes with 'Greedy Pissing Testicle' text on black background"). This anchors the model on what to PRESERVE, not what to draw.

## Step 3 — Wire it into the autopsy entry

In `src/data/autopsies.ts`, set:

```ts
heroImage: '/autopsies/<slug>-autopsy.jpg',
sourceBanner: '<original DexScreener header URL>',
```

The article page (`src/pages/AutopsyArticle.tsx`) automatically:
1. Renders the image as the **hero banner** above the header card.
2. Injects `og:image` + `twitter:image` meta tags pointing to the absolute URL.
3. Adds the image to the JSON-LD `Article.image` for Google.

The listing page (`src/pages/Autopsies.tsx`) automatically renders it as the card thumbnail.

## Step 4 — QA checklist (mandatory)

- [ ] Original token mascot/art still recognizable in the center
- [ ] "BLACKBOX AUTOPSY" stencil legible and at -45° (not horizontal, not too small)
- [ ] At least 4 distinct forensic props visible around the edges
- [ ] Red is blood-red (not orange, not pink)
- [ ] Dark moody grade — not bright/cheerful
- [ ] Output ≤ 1MB and renders crisp at OG size (1200×630 crop)
- [ ] Twitter card preview tested (via twitter card validator or paste-in-DM)

## Step 5 — Commit provenance

Each autopsy entry must keep `sourceBanner` populated so we can regenerate the treatment if the visual style evolves. Never delete the `.jpg` from `public/autopsies/` — these are referenced by external OG scrapers (X, Telegram, Discord) and breaking the URL kills shareability.

---

**Why this protocol exists:** Consistency is the brand. Every autopsy that hits Twitter/Telegram should be visually identifiable as a BlackBox forensic artifact within 0.3 seconds — same stencil, same red, same coroner-collage frame, different victim.