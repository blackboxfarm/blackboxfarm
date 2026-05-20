
## What I'll build

### 1. Featured CTO badge (real signals)
- New table `token_cto_status` (token_mint, is_cto, signals jsonb, detected_at, admin_override bool, set_by).
- Signals are pulled from data we already have: dev wallet renounced / inactive >7d, community wallet formed, social handover (handle changed from launchpad default), holder dispersion improving.
- On `/holders` and `/bubblemap`: gold "CTO — Community Takeover" badge with hover popover listing the *actual* signals + timestamps.
- Admin can force `is_cto=true` for FiEUFo…pump via the Super Admin → Token Curation panel (new small panel).

### 2. Narrative Link (editor note)
- New table `token_narrative_links` (token_mint, url, title, source_domain, editor_note, added_by, added_at).
- Renders on `/holders` as a bordered card:
  - Label: **"Editor Note — context, not financial advice"**
  - Source domain shown explicitly (e.g. `baptistnews.com`)
  - Title + 1-paragraph editor note + outbound link with `rel="noopener nofollow"`
- For FiEUFo…pump I'll seed the Baptist News URL with an editor note that frames the AI-encyclical narrative as cultural backdrop (no price claims, no "buy now").

### 3. Optimistic-but-honest AI summary
- New edge function `token-optimistic-summary` (separate from existing `token-ai-interpreter` so we don't pollute the neutral one).
- Inputs: live DexScreener metrics, holder distribution, dev reputation, CTO signals, attached narrative link content (fetched + summarized).
- System prompt rules (hard guardrails — non-negotiable):
  - **Tone:** opportunity-leaning, plain-English, energetic when metrics are genuinely positive; sober when they aren't.
  - **Never** says "buy", "FOMO in", "get in early", "moon", "guaranteed", or gives price targets.
  - **Never** fabricates a holder mix or changes numbers. Solscan totals must reconcile.
  - **Always** ends with one-line risk note + "Not financial advice."
  - May weave the narrative-link story in as *cultural/thematic context* (e.g. "launching into a week where mainstream press is covering AI + faith — the kind of tailwind a community-driven ticker can ride"), clearly framed as narrative not fundamentals.
- Renders with a small fireworks/sparkle motion flourish (framer-motion: animated star particles around the heading) when the summary loads, only when CTO badge is active — so the celebratory treatment is earned, not universal.

### 4. Seed data for FiEUFoZpjAdvoFRShKaxzuN5NXkuwe9jBPYDaeGpump
- Insert `token_cto_status` row with `admin_override=true` (you flagged it as CTO).
- Insert `token_narrative_links` row with the Baptist News URL.
- Pre-warm the optimistic summary cache so it's instant on first /holders view.

### What I will NOT do (holding the line)
- No hand-picked / manipulated holder mix. The bubblemap and holder table stay sourced from on-chain. If the real distribution is good, the AI will say so enthusiastically; if it's not, it'll stay quiet on that point rather than lie.
- No "urging FOMO" language. The energy comes from genuine signal + narrative framing, not from synthetic urgency.
- No removing "Not financial advice" or the source-domain disclosure on the editor note.

### Files
- New migration: `token_cto_status`, `token_narrative_links` (+ RLS: public read, admin write).
- New edge fn: `supabase/functions/token-optimistic-summary/index.ts` (uses `meteredAiFetch`, `assertDbWrite`).
- New components: `CTOBadge.tsx`, `NarrativeLinkCard.tsx`, `OptimisticAISummary.tsx` (with sparkle motion).
- Wire into `src/pages/Holders.tsx` above the report.
- Small admin panel `TokenCurationTab.tsx` under Super Admin for future tokens.

Reply **Plan Approved** and I'll ship it.
