## Goal

Lift the ICP analysis out of chat and turn it into a **permanent, editable, cross-referenceable strategy hub** at `/super-admin → 🎯 Marketing Profiles`. Treat it as a working tool — not a static dump — that other tabs (Email Campaigns, Intel Briefings, Social Media, Telegram Bot copy) can pull from.

---

## 1. New Super Admin tab — `🎯 Marketing Profiles`

Add a new top-level tab in `src/pages/SuperAdmin.tsx` (slotted next to **📧 Email Campaigns** since that's where it'll be used most).

The tab loads a new component: `src/components/admin/MarketingProfilesManager.tsx`.

---

## 2. Sub-tab structure (inside the new tab)

Five sub-tabs, each one a working document, not just text:

### A. **🧭 Overview & Positioning**
- Core value proposition ("Identity & Attribution, not just price")
- One-line elevator pitch (editable)
- The 3 differentiation pillars vs DexScreener / Solscan / RugCheck
- "What we are NOT" section (so marketing doesn't drift)

### B. **👤 Personas** (the heart of the tab)
A card-grid of editable persona profiles. Seeded with the 3 from the analysis:
1. **The Awakened Degen** (high-frequency Solana trader, post-rug)
2. **The Curious KYC Refugee** (frozen analytical professional)
3. **The Project Operator / Researcher** (builders + analysts)

Each persona card shows:
- Name + emoji + 1-line summary
- Demographics (age, role, capital range, time-on-chain)
- Pain points (bullet list)
- Watering holes (where they hang out — X lists, TG groups, subreddits, YouTube channels)
- Trigger moments (the "why now" — e.g. "just got rugged", "first $10k allocation")
- Our hook for them (the exact line that converts)
- Which features matter most (links into our /features list)
- Disqualifiers (who this ISN'T)

Each card has **Edit** and **Duplicate** buttons so you can spin off variants.

### C. **🎯 Campaign Playbooks**
Pre-built campaign templates linked to personas. For each playbook:
- Target persona(s)
- Platform (X / Telegram / Instagram / Reddit / YouTube / Email)
- Hook / headline angle
- CTA + landing page
- Suggested asset type (Breadcrumb image, Intel Briefing, video clip)
- Status (Draft / Live / Retired)

Seeded with 3-4 starters (e.g. "Caught Today" feed for X, "Read Your First Token" for YouTube, "Wall of Rugs" for Reddit).

### D. **🆚 Competitive Matrix**
Editable comparison table: BlackBox Farm vs DexScreener / Solscan / RugCheck / Bubblemaps.io / Chainedge — one row per capability, color-coded ✅ / ⚠️ / ❌. This becomes the source of truth for any "vs competitor" marketing copy.

### E. **🗣️ Messaging Library**
Reusable copy snippets organized by persona × channel × length (tweet / TG post / email subject / IG caption). Each snippet has copy-to-clipboard. This is what makes the tab a *tool* — when you're in Email Campaigns or writing an Intel Briefing, you copy from here.

---

## 3. Storage — database-backed, not hardcoded

So you can edit without code changes, create a single table:

**`marketing_profiles`** (jsonb-driven, super-admin RLS only)
- `id` uuid PK
- `section` text — `'positioning' | 'persona' | 'playbook' | 'competitor' | 'message'`
- `slug` text (unique within section)
- `title` text
- `data` jsonb (all the structured fields per section)
- `sort_order` int
- `is_active` bool default true
- `created_at`, `updated_at`

RLS: super-admins read/write; nobody else sees it (this is internal strategy).

I'll seed it with the full ICP analysis from the chat reply so day-one you open the tab and everything is already there.

---

## 4. Cross-tab integration (the "tool" part)

This is what stops it from being a static doc:
- **Email Campaigns tab**: add a "Persona" selector when composing a campaign — pulls from `marketing_profiles` so you tag who you're targeting and the analytics later show open/click rates per persona.
- **Intel Briefings**: add an optional "Target persona" tag on each article so you can later see which personas convert from which articles.
- **Messaging Library**: a small "📋 Insert from Library" button in the Email Campaigns composer and Intel Briefings editor that pops the snippet picker.

(I'll wire the `marketing_profiles` selector into Email Campaigns + Intel Briefings as part of this change. Future tabs can opt in later.)

---

## 5. Files to create / edit

**Create**
- `src/components/admin/MarketingProfilesManager.tsx` — top-level component with 5 sub-tabs
- `src/components/admin/marketing/PositioningPanel.tsx`
- `src/components/admin/marketing/PersonasPanel.tsx` + `PersonaCard.tsx` + `PersonaEditDialog.tsx`
- `src/components/admin/marketing/PlaybooksPanel.tsx` + edit dialog
- `src/components/admin/marketing/CompetitiveMatrixPanel.tsx`
- `src/components/admin/marketing/MessagingLibraryPanel.tsx`
- `src/components/admin/marketing/PersonaSelector.tsx` (reusable for Email Campaigns / Intel Briefings)
- `supabase/migrations/<ts>_create_marketing_profiles.sql` — table + RLS + seed data

**Edit**
- `src/pages/SuperAdmin.tsx` — add `marketing-profiles` TabsTrigger + TabsContent
- `src/components/admin/EmailCampaignsManager.tsx` (or equivalent) — add Persona selector
- `src/components/admin/IntelBriefingsManager.tsx` — add Persona tag field
- `src/integrations/supabase/types.ts` — auto-regenerated for new table

---

## 6. Out of scope (intentionally)

- Persona analytics dashboards (open rates, conversion-by-persona) — needs the tagging to exist first; we'll do that in a follow-up once you've used it for a few weeks.
- Public-facing persona pages — this stays internal / strategy-only.
- AI-generated persona suggestions — keep it human-curated for now.

---

## What you'll get on day one

Open `/super-admin → 🎯 Marketing Profiles` and the full ICP analysis is sitting there, organized into the 5 sub-tabs, fully editable, with the messaging library pre-stocked with sharp copy lines for each persona × channel. Email Campaigns and Intel Briefings get a "Target persona" dropdown so every piece of content you ship from this point forward is tagged.
