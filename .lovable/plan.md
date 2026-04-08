

## Fix Telegram Article Share — Remove Duplicate Link Preview

### Problem

When sharing an Intel Briefing to Telegram, the current template produces TWO URLs:
1. The `url` parameter (shared as the primary link — correctly unfurled via `og-meta` edge function with article title + image)
2. The same URL repeated in the `text` body after "Read the full briefing:" — this triggers a SECOND unfurl that pulls the sitewide `index.html` OG tags ("Crypto has hands — we show them...") instead of the article-specific meta

Telegram only unfurls ONE link preview per message. When two URLs are present, it can pick either one — and in this case it's showing the sitewide fallback description from the second occurrence.

### Root Cause

In `SocialShareBar.tsx` line 60, the Telegram share format is:
```
📰 {title}\n\n{description}\n\n🔗 Read the full briefing:
```
Then the `url` param appends the same URL again. Telegram sees two instances of the same URL and the unfurl behavior becomes unpredictable.

### Fix

**File: `src/components/intel/SocialShareBar.tsx`** (lines 59-61)

Change the Telegram share template to only include the title as text, and let the single `url` parameter handle the link preview. Remove the description and "Read the full briefing:" text since the OG unfurl already shows the article title, description, and image.

New format:
```
📰 {title}
```

The `url` param (which Telegram appends automatically) will be the only URL, ensuring Telegram's crawler hits `/intel/briefing/{slug}` → `og-meta` edge function → article-specific OG tags with the correct title, description, and featured image.

### Technical Detail

- The `_redirects` rule `/intel/briefing/:slug → og-meta?slug=:slug 200!` already serves correct article OG tags to crawlers
- The `og-meta` function already resolves `featured_image_url` from the article, not the sitewide default
- By having exactly ONE URL in the Telegram share, Telegram will unfurl it correctly with the article's OG image and description
- No edge function changes needed — the og-meta function is already correct

### Single file change

`src/components/intel/SocialShareBar.tsx` — Simplify Telegram `getUrl` to produce clean single-link share text.

