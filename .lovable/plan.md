## Goal

Package the HoldersIntel TG/chat-bot patterns into a single drop-in **skill pack** the other project's AI can read and execute against. New project gets its own Supabase, own tables, own content — no coupling back to this DB.

Bot persona on the new site: **Priest Confessional / Fortune Teller**. User types a confession → AI classifies it → AI picks the best-matching penance from a pre-written DB list → optional light AI rewrite for tone.

## What gets produced (in THIS project, for export)

A single folder `/mnt/documents/confessional-bot-skill/` containing:

```
confessional-bot-skill/
├── SKILL.md                       # The AI's onboarding doc
├── README-for-human.md            # What to paste where
├── references/
│   ├── 01-architecture.md         # Edge function ↔ DB ↔ frontend flow
│   ├── 02-db-schema.sql           # Tables + RLS + seed inserts
│   ├── 03-ai-classifier-prompt.md # System prompt + tool-call schema for sin classification
│   ├── 04-penance-selection.md    # How AI maps classification → penance row
│   ├── 05-persona-and-tone.md     # Voice rules (priest gravitas, no hellfire)
│   ├── 06-tg-bot-patterns.md      # Lessons from HoldersIntel: input sanitizer, brevity, referral memory, OTP linking
│   ├── 07-rate-limits-and-tiers.md# Anon vs free vs paid limits (HoldersIntel pattern)
│   └── 08-safety-guardrails.md    # Self-harm detection → bypass penance, show resource
├── code-templates/
│   ├── edge-confess.ts            # /confess edge function (AI-judged penance)
│   ├── edge-tg-webhook.ts         # Telegram webhook handler skeleton
│   ├── ConfessionalChat.tsx       # React mini chat widget
│   └── useConfessional.ts         # Frontend hook
└── seed-data/
    └── penances.csv               # ~50 starter penances tagged by sin category
```

## Architecture (documented in SKILL.md)

```text
User types confession
        │
        ▼
[Edge: /confess]
  1. Sanitize input (TG sanitizer pattern, length cap)
  2. Rate-limit check (session + IP)
  3. AI classify  → tool-call returns { category, severity, themes[] }
  4. SELECT FROM penances WHERE category=? AND severity<=? ORDER BY random() LIMIT 3
  5. AI pick best of 3 + light rewrite in priest voice
  6. Log to confessions table (hashed, no PII)
        │
        ▼
Return { penance_text, category, severity }
```

## DB schema (new project's Supabase)

- `penances` — id, category (enum: pride/greed/lust/envy/wrath/sloth/gluttony/vanity/fomo/other), severity (1-5), text, weight, active
- `confessions` — id, session_id, category, severity, penance_id, created_at (no raw confession text stored by default; opt-in flag)
- `confessional_sessions` — session_id, fingerprint, message_count, referral_tag (Dave/Tom pattern reused)
- RLS: anon can INSERT confessions + SELECT own session; only service role reads penances mgmt

## Persona rules (encoded in 05-persona-and-tone.md)

- Priest behind a screen, calm, never judgmental
- Penance feels symbolic, never punitive or harmful
- No religious-specific dogma — universal moral language
- Hard guardrail: self-harm/abuse keywords → skip penance, return crisis resource

## Patterns lifted from HoldersIntel (documented, not copy-pasted)

| HoldersIntel pattern | Reused as |
| --- | --- |
| Telegram Input Sanitizer | Strip control chars + cap length on confessions |
| Dave/Tom Referral Tracking | "Father X sent me" → tag session, warmth on return |
| Tiered Access | anon 3/day, free 10/day, paid unlimited |
| AI Configuration table (Personality/Knowledge/Guardrails) | New project's admin can tune voice without code |
| Lovable AI Gateway + tool-calls | Classifier returns structured JSON, not free text |
| `assertDbWrite` zero-tolerance pattern | Recommended for confession logs |

## What you do with the folder

1. I generate everything into `/mnt/documents/confessional-bot-skill/` and hand you a zip.
2. In the new Lovable project, open chat and say: *"Read every file in this folder and treat SKILL.md as your build brief. Start with the DB migration, then the edge function, then the React widget."*
3. Drop the folder contents into that project (drag into chat or paste contents file-by-file).
4. The new AI runs migrations, deploys edge functions, builds the UI — all self-contained on its own Supabase.

## Why this beats "just dump it"

- A raw dump = the other AI guesses what's important and rebuilds inconsistently.
- A skill pack = onboarding doc + schema + prompts + code templates, in the exact shape skills expect, so the AI implements it in one pass with no architectural drift.

## What I will NOT do here

- No changes to this (HoldersIntel) project's code or DB.
- No live link between the two projects.
- No copying of HoldersIntel-specific tables (allstars, dev reputation, etc.) — only the *patterns*.

## Deliverable

A single downloadable folder you can drag into the other project's chat. Total size small (~30-50 KB of markdown + code templates + CSV seed).

---

Reply **Plan Approved** and I'll generate the skill pack in `/mnt/documents/confessional-bot-skill/` and give you the artifact links.