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

## Step 2 — Generate the autopsy treatment

Use **Lovable AI image gen** (`google/gemini-2.5-flash-image` / `standard` tier).
If `edit_image` against the source URL fails repeatedly, regenerate from scratch with `generate_image` using the locked prompt below — do NOT downgrade quality.

### Locked prompt template

> A 1500×500 wide horizontal banner styled as a forensic TOKEN AUTOPSY evidence card. Center features **{{TOKEN_VISUAL_DESCRIPTION}}**. Around the edges: collage of vintage coroner/autopsy iconography — yellowed typewritten coroner report fragments with redacted black bars labeled CAUSE OF DEATH and CASE FILE, a chalk body outline, a toe-tag on string, clipboard with death certificate, magnifying glass and scalpel, red skull-and-crossbones ink stamps, yellow DO NOT CROSS crime-scene tape across one corner, blood-spatter ink stains, a crooked red EVIDENCE rubber stamp, barcode strip. Across an empty diagonal section, the text **"BLACKBOX AUTOPSY"** in bold military stencil font, rotated -45 degrees, deep blood-red with sprayed distressed spray-paint edges, dominant size with soft drop shadow. Dark moody color grade, distressed paper texture, premium forensic case-file aesthetic, photographic collage style, not cartoonish in execution.

### Locked parameters

| Parameter | Value |
|---|---|
| `model` | `standard` (or `google/gemini-2.5-flash-image` via gateway) |
| `width` | `1536` |
| `height` | `512` |
| `transparent_background` | `false` |
| Aspect ratio target | **3:1** (banner) |
| Output format | `.jpg` (smaller, fine for collage) |
| Output path | `public/autopsies/<slug>-autopsy.jpg` |

### Variable injection

Replace `{{TOKEN_VISUAL_DESCRIPTION}}` with a 1-sentence factual description of the source banner's central subject (e.g. "a stylized cartoonish dripping green testicle character with eyes — the GPT meme token mascot"). Keep ticker symbols and on-banner text out of this field — the stencil overlay handles branding.

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