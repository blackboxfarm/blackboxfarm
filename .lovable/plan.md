

# Two-Part Implementation: Dynamic Article Sitemap + Unified AI Identity & Chat History

## Part 1: Dynamic Article Sitemap

### What it does
Creates an edge function that generates a live XML sitemap from published `intel_briefings`, and converts the static `sitemap.xml` into a sitemap index that references both the static pages and the dynamic articles sitemap. Articles added/removed are automatically reflected.

### Changes

**Create `supabase/functions/sitemap-articles/index.ts`**
- Queries `intel_briefings` where `is_published = true`
- Generates valid XML sitemap with `<loc>`, `<lastmod>`, `<changefreq>daily`, `<priority>0.7`
- URL format: `https://blackbox.farm/intel/briefing/{slug}`
- Returns `Content-Type: application/xml`, no auth required

**Update `public/sitemap.xml` → Sitemap Index**
- Convert to `<sitemapindex>` format pointing to:
  - `https://blackbox.farm/sitemap-static.xml` (the current static pages)
  - `https://blackbox.farm/sitemap-articles.xml` (proxied to edge function)

**Create `public/sitemap-static.xml`**
- Move all current static `<url>` entries here (minus the removed /bumpbot and /volumebot)

**Update `public/_redirects`**
- Add: `/sitemap-articles.xml https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/sitemap-articles 200!`

---

## Part 2: `/myname` Command + Unified Cross-Platform Chat History

### What it does
1. Adds `/myname NAME` command so users can explicitly set their preferred name
2. Both web-chat and TG bot write every message to `unified_chat_history` (the table already exists)
3. When the AI responds on either platform, it loads the user's `preferred_name` from `ai_user_memory` and uses it
4. Chat windows start fresh each session (no loading old messages), but everything is recorded for AI context

### Changes

**Bot webhook: `holdersintel-bot-webhook/index.ts`**

- Add `/myname` command handler:
  - Parses name from args (e.g. `/myname Alex`)
  - Updates `ai_user_memory.preferred_name` for the linked user
  - Confirms: "Got it, I'll call you Alex from now on!"
  - If no args: shows current name or prompts to set one
- Add `/myname` to the command switch
- Add `/myname` to `handleHelp` output under Setup commands
- Add `/myname` and `/signup` to the system prompt's command reference section
- After each AI chat exchange, write both user + assistant messages to `unified_chat_history` with `platform: 'telegram'`, `telegram_user_id`, and `account_user_id` (from linked account)
- Inject last 5 cross-platform messages from `unified_chat_history` into the AI system prompt as "Recent conversation context" so the AI knows what was discussed on the website too

**Web chat: `web-chat/index.ts`**

- After streaming completes, write user messages + assistant reply to `unified_chat_history` with `platform: 'web'`, `web_session_id`, and `account_user_id`
- When building the system prompt for logged-in users, fetch last 5 entries from `unified_chat_history` (across both platforms) and inject as context
- The frontend behavior stays the same: `sessionStorage` clears on tab close, chat starts fresh on return

**Command list UI: `TelegramCommandList.tsx`**

- Add `/myname` to the Setup group
- Add `/signup` to the Setup group

### Welcome message update

Update `handleStart` for linked users to greet them by preferred name if available:
```
✅ Welcome back, Alex! Your tier: PRO. Use /help for commands.
```

### Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/sitemap-articles/index.ts` | CREATE |
| `public/sitemap.xml` | MODIFY → sitemap index |
| `public/sitemap-static.xml` | CREATE (current static URLs) |
| `public/_redirects` | MODIFY — add sitemap proxy |
| `supabase/functions/holdersintel-bot-webhook/index.ts` | MODIFY — /myname, unified history writes, cross-platform context |
| `supabase/functions/web-chat/index.ts` | MODIFY — unified history writes, cross-platform context |
| `src/components/telegram/TelegramCommandList.tsx` | MODIFY — add /myname, /signup |

### No database changes needed
- `unified_chat_history` table already exists with correct schema
- `ai_user_memory.preferred_name` column already exists

