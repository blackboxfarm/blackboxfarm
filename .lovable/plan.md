
## AI Bot Personality & Knowledge Management System

### Overview
Build a complete admin dashboard to control the AI bot's personality, expertise areas, guardrails, and knowledge base — used for both Telegram DM and future web chat interactions.

### Database Tables (3 new tables)

#### 1. `bot_personality_config` (singleton)
Stores the bot's core personality settings:
- `persona_name` (text) — e.g. "HoldersIntel Assistant"
- `persona_description` (text) — who the bot thinks it is
- `tone` (text) — e.g. "friendly, casual, emoji-rich, enthusiastic"
- `expertise_areas` (text[]) — array of topics it's an expert in
- `language_behavior` (text) — e.g. "Match user's language automatically"
- `greeting_template` (text) — first-time user greeting
- `fallback_response` (text) — when it doesn't know something
- `max_response_length` (int) — character cap
- `is_active` (bool) — kill switch
- `updated_at`, `updated_by`

#### 2. `bot_knowledge_bins` 
Categorized knowledge entries the bot draws from:
- `id`, `category` (enum: faq, features, security, billing, onboarding, troubleshooting, marketing, compliance)
- `title` (text) — short label
- `content` (text) — the actual knowledge/answer
- `keywords` (text[]) — trigger words for matching
- `priority` (int) — higher = preferred when multiple match
- `is_active` (bool)
- `created_at`, `updated_at`, `created_by`

#### 3. `bot_guardrails`
Hard rules the bot must follow:
- `id`, `rule_type` (enum: never_say, always_say, redirect, tone_override, topic_block)
- `rule_name` (text) — short label
- `rule_content` (text) — the actual instruction
- `severity` (enum: soft, hard, critical) — how strictly enforced
- `is_active` (bool)
- `created_at`, `updated_at`

### Admin Dashboard (new tab in Super Admin → "AI Config")

#### Sub-tabs:

**1. Personality**
- Form to edit persona name, description, tone, expertise areas
- Toggle for active/inactive (kill switch)
- Language behavior dropdown
- Greeting & fallback template editors
- Response length slider
- Live preview of assembled system prompt

**2. Knowledge Bins**
- Table view of all knowledge entries grouped by category
- Add/Edit/Delete with modal forms
- Keyword tag editor
- Priority ordering
- Active/inactive toggle per entry
- Bulk import (paste multiple Q&As)

**3. Guardrails**
- Table of all rules with type badges and severity indicators
- Add/Edit/Delete rules
- Color-coded severity (green=soft, yellow=hard, red=critical)
- Preset templates: "Never recommend competitors", "Never give financial advice", "Always redirect billing questions to website", etc.

**4. Prompt Preview**
- Read-only view of the fully assembled system prompt that gets sent to the AI
- Shows: personality + knowledge context + guardrails combined
- Copy button for testing in external AI tools

### Edge Function Integration
- Update `handleAiFreeChat` to fetch personality + active knowledge bins + active guardrails from DB
- Assemble system prompt dynamically instead of hardcoded
- Cache with 5-min TTL to avoid hitting DB on every message

### Seed Data
Pre-populate with current hardcoded personality, plus ~15 knowledge bins covering:
- What is HoldersIntel / what do we do
- Email verification process
- Available bot commands
- Website features (Bubblemaps, Oracle, holders page)
- Pricing (free for now)
- How to share on socials
- Security practices
- How alerts work
- Registration process

And ~8 guardrails:
- Never recommend competitor tools
- Never give financial/investment advice
- Never share internal system details
- Always redirect payment questions to website
- Never badmouth other projects
- Always encourage email verification
- Keep responses under 500 words
- Match user's language

### Files to Create/Change

| File | Change |
|------|--------|
| Migration | Create 3 new tables + enums + RLS + seed data |
| `src/components/admin/ai-config/PersonalityTab.tsx` | Personality editor form |
| `src/components/admin/ai-config/KnowledgeBinsTab.tsx` | Knowledge CRUD table |
| `src/components/admin/ai-config/GuardrailsTab.tsx` | Guardrails CRUD table |
| `src/components/admin/ai-config/PromptPreviewTab.tsx` | Assembled prompt viewer |
| `src/components/admin/ai-config/index.ts` | Barrel exports |
| `src/pages/SuperAdmin.tsx` | Add "AI Config" tab |
| `supabase/functions/holdersintel-bot-webhook/index.ts` | Fetch config from DB, assemble dynamic prompt |
