

# Manual Social Post Builder — Master Template + 25 Platform Tabs

## Concept

A new section within the Social Media Manager called **"Manual Post Builder"** that works as a two-layer system:

1. **Master Template Tab** — You fill in ALL content once (title, body text, hashtags, image URL, video URL, link URL, alt text, CTA, etc.)
2. **Platform Tabs (25 platforms)** — Each tab auto-formats the master content into that platform's ideal layout, displayed as a read-only "copy-paste card" with:
   - Platform-specific character limits applied
   - "Copy to Clipboard" buttons per field
   - "Open Platform" button that opens the social site in a new browser tab
   - A "Save as Draft" button that logs it to the database for historical reference
3. **History per Platform** — View past manual posts filtered by platform

## Master Template Fields

| Field | Description |
|-------|-------------|
| Title / Headline | Short title (used by YouTube, Medium, LinkedIn, etc.) |
| Body Text (Long) | Full-length post body (trimmed per platform) |
| Body Text (Short) | Optional short version for Twitter/Threads |
| Hashtags | Comma-separated, auto-formatted with # |
| Image URL | Primary image + Gallery picker |
| Video URL | For YouTube, TikTok, Kick, Twitch clips |
| Link URL | Primary CTA link |
| Alt Text | Image accessibility text |
| Tags / Mentions | @handles relevant to the post |
| CTA Text | Call-to-action line |
| Category | Dropdown: Announcement, Alpha, Meme, Thread, Tutorial |

## 25 Platform Tabs with Specs

Each tab shows a formatted preview card with the master data adapted to that platform's constraints:

| # | Platform | Max Chars | Needs Image | Needs Video | Has Title Field | API Status |
|---|----------|-----------|-------------|-------------|-----------------|------------|
| 1 | X / Twitter | 280 | optional | optional | no | Has API |
| 2 | Threads | 500 | optional | optional | no | No API |
| 3 | Instagram | 2200 | required | optional | no | Has API |
| 4 | Facebook | 63,206 | optional | optional | no | Has API |
| 5 | LinkedIn | 3000 | optional | optional | no | Has API |
| 6 | TikTok | 2200 | no | required | yes | Has API |
| 7 | YouTube | 5000 (desc) | yes (thumb) | required | yes | Has API |
| 8 | Reddit | 40000 | optional | optional | yes | Has API |
| 9 | Pinterest | 500 | required | optional | yes | Has API |
| 10 | Telegram | 4096 | optional | optional | no | Has API |
| 11 | Discord | 2000 | optional | optional | no | Has API |
| 12 | Medium | unlimited | optional | no | yes | Has API |
| 13 | Substack | unlimited | optional | no | yes | No API |
| 14 | Mirror.xyz | unlimited | optional | no | yes | Has API |
| 15 | Hashnode | unlimited | optional | no | yes | Has API |
| 16 | Dev.to | unlimited | optional | no | yes | Has API |
| 17 | Farcaster | 1024 | optional | optional | no | Has API |
| 18 | Lens Protocol | 5000 | optional | optional | no | Has API |
| 19 | Warpcast | 1024 | optional | no | no | Has API |
| 20 | Quora | 100000 | optional | no | yes | No API |
| 21 | Twitch | 500 (title) | no | required | yes | Has API |
| 22 | Kick | 500 | no | required | yes | No API |
| 23 | Snapchat | 250 | required | optional | no | No API |
| 24 | Guild | n/a | optional | no | yes | No API |
| 25 | DeBank | 1000 | optional | no | no | No API |

## Architecture

### Database Changes (1 migration)

Extend `social_posts_log` with new columns for manual posts:
- `post_type` — `'api'` or `'manual'` (default `'api'` for backward compat)
- `title` — post title
- `hashtags` — text
- `image_url` — text
- `video_url` — text
- `link_url` — text
- `alt_text` — text
- `tags_mentions` — text
- `cta_text` — text
- `category` — text
- `master_template_id` — uuid (links platform posts back to the master snapshot)

### New Files

1. **`src/components/admin/social/ManualPostBuilder.tsx`** (~400 lines)
   - Master Template form with all fields
   - State management via `useState` that feeds all platform tabs
   - "Save Master Template" persists a snapshot row

2. **`src/components/admin/social/PlatformPostCard.tsx`** (~150 lines)
   - Reusable card component that receives master data + platform config
   - Auto-trims text to platform char limit
   - Shows formatted preview
   - "Copy All" and per-field "Copy" buttons
   - "Open [Platform]" button → `window.open(platformUrl, '_blank')`
   - "Save as Posted" → inserts into `social_posts_log` with `post_type='manual'`

3. **`src/components/admin/social/platformConfigs.ts`** (~200 lines)
   - Array of 25 platform definitions: name, icon/color, charLimit, requiresImage, requiresVideo, hasTitle, postUrl, apiStatus

4. **`src/components/admin/social/ManualPostHistory.tsx`** (~100 lines)
   - Filtered view of `social_posts_log` where `post_type='manual'`
   - Grouped by `master_template_id` so you can see "I posted this to 8 platforms on April 12"

### Modified Files

5. **`src/components/admin/tabs/SocialMediaTab.tsx`**
   - Add a new top-level tab: "📝 Manual Builder"
   - Contains `ManualPostBuilder` which internally renders sub-tabs for all 25 platforms

## UX Flow

1. Click "Manual Builder" tab
2. Fill in master template fields (title, body, hashtags, image, etc.)
3. Click through platform sub-tabs — each shows your content formatted for that platform
4. Click "Copy All" → copies the formatted post text
5. Click "Open X" → opens twitter.com/compose/tweet in new tab
6. Paste and post manually
7. Come back, click "Mark as Posted" → saves to history
8. Tomorrow: repeat with a new master template, old ones preserved in history

## Implementation Priority

This is a large feature. The plan creates it in one pass:
- Migration + platformConfigs + ManualPostBuilder + PlatformPostCard + ManualPostHistory + wire into SocialMediaTab

Total: ~5 files modified/created, 1 migration.

