INSERT INTO public.super_admin_docs (slug, title, category, summary, content_md, tags, is_pinned, sort_order)
VALUES (
  'marketing-profiles-guide',
  '🎯 Marketing Profiles — Overview & Guide',
  'marketing',
  'Overview + teaching guide for the 🎯 Marketing Profiles tab — what each sub-tab does, how to use it day-to-day, and how it wires into Email Campaigns and Intel Briefings.',
$doc$# 🎯 Marketing Profiles — Overview & Teaching Guide

A permanent, editable strategy hub at **/super-admin → 🎯 Marketing Profiles**. Lifts the ICP analysis out of chat and turns it into a working tool other tabs can pull from.

---

## Why this tab exists

Strategy work was getting buried in chat replies. This tab is the **single source of truth** for *who we sell to, what we say, and how we beat the competition*. Everything is editable in place — no code changes needed to update positioning, personas, or copy.

---

## The 5 sub-tabs

### 🧭 Positioning
The headline-level story:
- **Elevator pitch** — one line that anyone on the team can repeat.
- **Value proposition** — the longer "why us" paragraph.
- **Differentiation pillars** — the 3 things we do that DexScreener / Solscan / RugCheck don''t.
- **What we are NOT** — guardrails so marketing copy doesn''t drift into "another DEX scanner."

> Edit anything → click **Save**. Changes are live immediately.

### 👤 Personas
The heart of the tab. Pre-seeded with our 3 ICPs:
1. **The Awakened Degen** — high-frequency Solana trader, post-rug, needs 30-second forensic synthesis.
2. **The Curious KYC Refugee** — analytical professional moving CEX → on-chain, frozen by transparency overload, needs guided entry points.
3. **The Project Operator / Researcher** — builders + analysts looking for legitimacy markers and ID-resolution APIs.

Each persona card holds: demographics, pain points, watering holes (X lists, TG groups, subreddits), trigger moments ("why now"), our exact hook, which features matter most, and disqualifiers (who this **isn''t**).

Use **Edit** to refine; **Duplicate** to spin off a campaign-specific variant (e.g. "Awakened Degen — EU edition").

### 🎯 Playbooks
Pre-built campaign templates linked to personas. Each playbook captures: target persona(s), platform (X / TG / IG / Reddit / YouTube / Email), hook angle, CTA + landing page, suggested asset type (Breadcrumb, Intel Briefing, video clip), and status (Draft / Live / Retired).

Treat playbooks as **reusable shells** — when launching a new campaign, duplicate the closest playbook and tweak.

### 🆚 Competitive Matrix
Living comparison table: BlackBox Farm vs DexScreener / Solscan / RugCheck / Bubblemaps / Chainedge.
- Click any cell to cycle ✅ → ⚠️ → ❌.
- First column (BlackBox Farm) is **us** — keep it honest.
- This is the source of truth for any "vs competitor" marketing copy. If a claim isn''t backed by a ✅ here, don''t ship it.

### 🗣️ Messaging Library
The day-to-day tool. Reusable copy snippets organized by **persona × channel × length** (tweet / TG post / email subject / IG caption). Every snippet has copy-to-clipboard.

When writing an Email Campaign or Intel Briefing, **start here** — don''t write from scratch.

---

## How it connects to other tabs

- **Email Campaigns** → will get a "Target persona" selector pulling from this tab, so analytics later show open/click rates **per persona**.
- **Intel Briefings** → optional `target_persona_slug` tag on each article so we can see which personas convert from which articles.
- **Messaging Library** → the "Insert from Library" button (in Email Campaigns + Intel Briefings editors) pops the snippet picker.

The reusable `<PersonaSelector />` component is ready to drop into any future editor.

---

## How it''s stored

- Table: `public.marketing_profiles` (super-admin RLS only — never visible to other users).
- Single `jsonb` `data` column per row, scoped by `section` (`positioning` / `persona` / `playbook` / `competitor` / `message`).
- All edits go straight to the DB — no draft state, no publish step.

---

## Day-to-day workflow

1. **Before launching any campaign** → open Personas, confirm which one you''re targeting.
2. **Writing copy** → open Messaging Library, filter by persona + channel, copy a starter snippet, refine.
3. **Comparing to a competitor in copy** → check the Competitive Matrix first. Update it if reality has changed.
4. **New persona discovered** (e.g. a new sub-segment converting well) → add a card. It immediately becomes available in the PersonaSelector everywhere.
5. **Retiring a campaign angle** → mark the playbook as "Retired" (don''t delete — keep the history).

---

## Teaching points / common mistakes

- **Don''t write copy that contradicts Positioning → "What we are NOT".** If a snippet positions us as "the cheapest scanner," delete it.
- **Personas are not buyer personas in a vacuum** — every field should drive a marketing decision. If a field has no copy implication, leave it blank.
- **The Competitive Matrix is not aspirational.** Only ✅ what we can demo today.
- **Snippets should be channel-native.** A tweet snippet should sound like a tweet, not an email subject line.
- **When in doubt, duplicate.** Variants are cheap; rewriting from scratch wastes time.

---

## Future additions (not built yet)

- Persona-tagged analytics dashboards (open rates, conversion-by-persona).
- AI-suggested persona fits when composing a new Intel Briefing.
- Public-facing persona landing pages (still internal-only for now).
$doc$,
  ARRAY['marketing','personas','icp','guide'],
  true,
  5
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md,
  tags = EXCLUDED.tags,
  is_pinned = EXCLUDED.is_pinned,
  updated_at = now();