# Platform-Ready Article Export

## The root cause

Our articles are stored as **Markdown** (`content_md`). When you copy text off the rendered article page, the browser copies the *visible text* — which still includes things like `**bold**` because some inline markers leak through, and the structure (headings/lists/links) gets flattened. Medium, Substack, LinkedIn, Ghost, Beehiiv all accept **rich HTML paste** from the clipboard — if we put real HTML on the clipboard, they convert it to their native bold/H2/bullets/links automatically. No more manual cleanup per platform.

## What you'll get

A new **"Export for Platform"** panel on every published article (visible only to super-admins) with one-click buttons:

- **Copy for Medium** — rich HTML, Medium-friendly (H1 stripped because Medium uses the title field, images inlined as URLs).
- **Copy for Substack** — rich HTML, keeps H2/H3, converts blockquotes to Substack pull-quote style.
- **Copy for LinkedIn** — plain text with Unicode bold (𝗯𝗼𝗹𝗱) since LinkedIn strips HTML; links left as bare URLs.
- **Copy for Ghost / Beehiiv / generic** — clean semantic HTML.
- **Copy as Plain Text (no markdown)** — strips every `*`, `_`, `#`, `>` and list marker but keeps paragraph breaks; useful for Telegram/X long posts.
- **Download as .docx** (optional, stretch) — for anywhere paste fails.

Each button writes **both** `text/html` and `text/plain` to the clipboard using the `ClipboardItem` API, so the destination editor picks whichever it supports. A toast confirms "Copied for Medium — paste into the editor."

## Where it appears

1. **Public article page** `/intel/briefing/:slug` — floating bottom-right panel, super-admin only (same gate as the DeadTokens X-post button).
2. **Admin → Intel Briefings → article row** — a "📋 Export" dropdown beside the existing Edit / Publish buttons so you can grab formats without opening the article.

## Technical details

- New util `src/lib/articleExport.ts`:
  - `mdToHtml(md, preset)` — uses existing `react-markdown` pipeline isomorphically via `marked` (already a small dep we can add) to produce a clean HTML string. Presets: `medium`, `substack`, `linkedin`, `ghost`, `generic`, `plain`.
  - `mdToUnicodeBold(md)` — strips markdown and replaces `**x**` with mathematical-bold Unicode for LinkedIn.
  - `mdToPlain(md)` — strips every markdown marker, normalizes whitespace.
  - `copyRich(html, plain)` — writes a `ClipboardItem` with both MIME types; falls back to `navigator.clipboard.writeText(plain)` on browsers without ClipboardItem.
- New component `src/components/intel/ArticleExportPanel.tsx` — collapsible floating panel with the buttons + a small "preview" textarea showing the first 400 chars of the chosen format so you can sanity-check before pasting.
- Wire it into:
  - `src/pages/IntelBriefingArticle.tsx` (super-admin gated, same `useUserRoles().isSuperAdmin` pattern as the DeadTokens button).
  - `src/components/admin/intel-briefings/...` (the row action menu — exact file to be located during build).
- No DB changes. No edge-function changes. Pure frontend.
- Preserves existing CrossPost / TLDR / DeadTokens buttons.

## Out of scope (ask if you want them)

- Auto-posting via API to Medium/Substack (their APIs are restricted/dying — manual paste is more reliable).
- Per-platform image hosting (we keep using your existing image URLs; Medium re-uploads on paste).
- Editing the source Markdown to change the stored format — your `content_md` stays the canonical source.

Approve and I'll build it.