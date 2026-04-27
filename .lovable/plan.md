
# HoldersIntel Reputation Engine — Manifesto + Surface Updates

Four tracks. #2 (public Creator Profile pages) is intentionally deferred — keep it admin/beta only.

---

## Track A — "HoldersIntel Dev Team Foreward" floating modal (NEW)

A small floating icon, present on every page (mobile + desktop), positioned roughly where the user's mouse pointer sits in the screenshot — at the **right edge of the nav bar row**, just past the last nav tab. On click, opens an old-school terminal-style modal with the manifesto.

### Placement

- Render inside `SiteLayout.tsx` as a sibling to the `<nav>` inside the nav bar container, absolutely positioned to the right end of the nav row (so it sits on the same horizontal line as the tabs, near the right gutter).
- On mobile: same row, but shrink to icon-only (no label) and tuck it just before the mobile scroll-hint chevron so it doesn't get clipped by overflow scroll.
- z-index above the scroll-hint gradient so it's always clickable.

### Icon choice

Recommend `ScrollText` from lucide-react (parchment/scroll vibe, fits "foreward / dev note") with a subtle amber/gold tint matching brand. Alternative: `BookOpen` or `Feather`. I'll use `ScrollText` unless you say otherwise.

### Hover label

Tooltip text (shadcn `Tooltip`): **"HoldersIntel Dev Team Foreward"**

### Modal content (verbatim, old-school formatted)

- shadcn `Dialog` modal, max-w ~`2xl`.
- Body styled as a terminal/typewriter: `font-mono`, slight green-on-near-black (`bg-[#0a0a0a] text-[hsl(140_60%_75%)]`), thin amber border, ASCII rule lines above and below the body, blinking caret at the end.
- Header row: `> cat /var/holdersintel/foreward.txt`
- Footer signature right-aligned: `— HoldersIntel Dev Team`
- Small "ESC to close" hint bottom-left.

Body text (exact, preserved line breaks):

```
HoldersIntel is a Reputation Engine.

Primary entities: Creator Profiles ↔ Token Projects
(many-to-many, cross-linked on many signals)

The lifecycle outcome of a Token Project
(success/failure, intentional/accidental)
is evidence that updates the Creator's reputation.

Data is collected from many sources
(on-chain, X, Telegram, web scrapes, KYC traces,
behavioral analysis).

Data is displayed across many surfaces
(web reports, Bubble Map, Telegram bot DMs/groups,
Intel Briefings, Live Feed).

Monetization: monthly subscription unlocks the
full pipeline.
```

### Files

- **NEW**: `src/components/layout/DevTeamForewardButton.tsx` — icon button + tooltip + dialog, all self-contained.
- **EDIT**: `src/components/layout/SiteLayout.tsx` — mount it inside the nav-bar container at the right edge.

---

## Track B — Reframe sitewide copy around "Reputation Engine" (Track #1)

Tighten the public surfaces so the thesis lands without anyone having to click the foreward.

### Files & changes

1. **`src/pages/Index.tsx` (landing)**
   - Hero subhead: replace current line with → *"The Reputation Engine for Solana creators. Every wallet, every token, every outcome — linked."*
   - Add a 3-line "How it works" strip directly under the hero: **Creators ↔ Tokens → Outcomes → Reputation.**
2. **`src/pages/Pricing.tsx`**
   - Top-of-page banner: *"Your subscription unlocks the full reputation graph — not features, evidence."*
3. **`public/llms.txt` and `public/ai.txt`**
   - Replace tagline with the manifesto's first paragraph so AI crawlers index us as a reputation engine, not a "holders tool".
4. **`index.html` `<meta name="description">`** — same reframing (~155 chars).
5. **`src/components/chat/` AI persona seed** — append one sentence to Helper Mode and Signal Mode system prompts: *"You are the front-end of a Reputation Engine. Creators and Token Projects are the two primary entities; outcomes are evidence."* (Located in the AI Config table — done via a tiny migration that updates the existing `ai_configurations` rows.)

---

## Track C — Add `intent_classification` dimension (Track #3)

Make intent (rug / abandoned / accidental-fail / organic-success / engineered-success) a first-class field used by autopsy and allstar engines.

### Files & changes

1. **NEW migration** — add `intent_classification` enum + column to `token_lifecycle_events` (or whichever table autopsy/allstar already write to; verified during exploration to be `token_autopsies` and `allstar_mint_alerts`).
   - Enum values: `rug_pull`, `soft_rug`, `abandoned`, `accidental_failure`, `organic_success`, `engineered_success`, `unknown`.
   - Default `unknown`.
2. **EDIT `supabase/functions/token-autopsy/index.ts`** — heuristic classifier (LP yanked + dev sells inside 1h → `rug_pull`; LP intact + zero dev activity 7d → `abandoned`; etc.). Write classification when autopsy runs.
3. **EDIT `supabase/functions/allstar-promotion-engine/index.ts`** — read intent; only promote on `organic_success` or `engineered_success`. Demote/skip if any historic `rug_pull`.
4. **EDIT `src/components/admin/CreatorProfileDrawer.tsx`** — add an "Intent breakdown" row (counts per intent type across the creator's tokens).
5. **Pro gating** — surface intent breakdown publicly only on Pro tier. Free/anon sees aggregate "X tokens, Y rugs" without per-token intent labels.

---

## Track D — Pricing reframe around the reputation graph (Track #4)

Rewrite `src/pages/Pricing.tsx` tier cards from feature-list to **access-tier-of-graph**:

| Tier | Reframed value |
|------|----------------|
| Free | "Sample one Creator's reputation per day" |
| Pro  | "Full graph access — every Creator, every Token, every link, every outcome" |
| Enterprise / Telegram annual | unchanged structurally; subhead becomes *"Direct pipe into the reputation graph"* |

- Keep Stripe links untouched (per existing memory).
- Keep the existing `TierCards` component shape; just rewrite copy and bullets.

---

## Out of scope (per your call)

- Public `/creator/{id}` route — stays admin-only / beta. No public link added anywhere. CreatorProfileDrawer remains the only viewer for now.

---

## Technical notes

- All new work is read-mostly except (a) one tiny migration for `intent_classification`, (b) one migration to update `ai_configurations` system-prompt rows, and (c) the new component file.
- No cron changes, no new edge functions.
- `assertDbWrite` used for any DB write touched (zero-tolerance rule).
- Foreward modal is pure client UI — no DB.

---

## Order of execution (when you approve)

1. Add `DevTeamForewardButton` + wire into `SiteLayout` (visible immediately on every page).
2. Reframe copy on Index, Pricing, llms.txt, ai.txt, index.html meta.
3. Migration + autopsy/allstar wiring for `intent_classification`.
4. Pricing tier rewrite.
5. AI persona seed migration.
