

# Content Condensation System — 75% / 50% / 25% Variants

## What This Builds

A new **"Repurpose"** tab in Intel Briefings that lets you generate and edit condensed versions of every article at 3 depth levels — ready to copy-paste onto Medium (75%), Twitter Articles / Fiverr paid posts (50%), and Reddit / short-form platforms (25%). Each variant includes a backlink to the original article.

## How It Works

1. **New database table** `intel_briefing_variants` stores the condensed content per article per depth level
2. **AI auto-generates** the initial condensed versions from the original `content_md`
3. **Editable textareas** let you tweak each version before publishing externally
4. Each variant automatically appends a "Read the full analysis at blackbox.farm/intel/briefing/{slug}" backlink

## Database

New table `intel_briefing_variants`:
- `id` (uuid, PK)
- `briefing_id` (uuid, FK → intel_briefings.id)
- `depth` (integer — 75, 50, or 25)
- `content_md` (text — the condensed article)
- `updated_at` (timestamp)
- Unique constraint on `(briefing_id, depth)`
- RLS: authenticated users only

## New Component: `ContentCondenser.tsx`

- Lists all published briefings in a compact accordion
- Each briefing expands to show 3 cards: **75%** (Medium), **50%** (Twitter/Fiverr), **25%** (Reddit)
- Each card has:
  - A **Generate** button (calls AI to condense from original)
  - An **editable textarea** showing the condensed content
  - A **Save** button to persist edits
  - A **Copy** button to clipboard
  - A badge showing target platform hint
- Progress indicator showing how many articles have all 3 variants generated

## AI Condensation Logic

Uses the AI gateway script to generate each variant with tailored prompts:
- **75%**: "Rewrite this article at ~75% length. Preserve all key arguments, data points, and structure. End with: *Read the full deep-dive at blackbox.farm/intel/briefing/{slug}*"
- **50%**: "Condense to ~50% length. Keep the core thesis, key stats, and 2-3 strongest points. Conversational tone. End with backlink."
- **25%**: "Create a punchy summary at ~25% length. Lead with the hook, include 1-2 key insights. End with backlink."

## Integration

- New tab **"✂️ Repurpose"** added to `IntelBriefingsManager` alongside Articles, Publications, and AI Playbook
- Ties into existing `intel_publications` tracking — after you post a condensed version somewhere, log it in the Publications tab with the matching content_depth (75/50/25)

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/new.sql` | Create `intel_briefing_variants` table |
| `src/components/admin/publications/ContentCondenser.tsx` | New component — the repurpose UI |
| `src/components/admin/IntelBriefingsManager.tsx` | Add Repurpose tab |

