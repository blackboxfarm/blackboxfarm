

# Plan: Visitors Location + /feed Page + Nav Updates

## 1. Where are Visitors?

The **Visitors** dashboard is inside Super Admin → **Holders Intel** tab → **👁️ Visitors** sub-tab. It's nested two levels deep. No changes needed — it's working, just buried.

---

## 2. New `/feed` Page — Public Token Intel Feed

### Data Source
- **`holders_intel_post_queue`** table: 11,474 posted entries with `tweet_id`, `symbol`, `name`, `market_cap`, `posted_at`, `token_mint`, `trigger_source`
- Join with **`holders_intel_seen_tokens`** for `health_grade` and `image_uri`
- No scraping needed — we have full post history in the database already

### Page Layout

**Top Banner**: Telegram channel promo — "This feed is live and free in our Telegram channel — join now!" with link to channel.

**Search Bar**: Input for `$TICKER` or token mint address. If input looks like a wallet address (not a mint) or an X handle, show a redirect modal pointing to `/holders` or `/bubblemap`.

**View Toggle**: Summary View (default) | Grid View

**Summary View** (Twitter-feed style):
- Card per post, flowing vertically
- Shows: token image (if available), `$SYMBOL` / name, health grade badge, market cap, posted date, trigger source
- Click to expand inline (desktop) or open modal (mobile) showing the full tweet content via embedded tweet link (`https://x.com/HoldersIntel/status/{tweet_id}`)

**Grid View** (spreadsheet style):
- Single-line rows: `$TICKER` | Health Score | Total Wallets | Date
- Compact, sortable columns

**Pagination**: 50 items per page, sorted by `posted_at` DESC default.

### Technical Details
- New file: `src/pages/Feed.tsx` wrapped in `SiteLayout`
- Uses `supabase` client to query `holders_intel_post_queue` joined with `holders_intel_seen_tokens`
- RLS: Table already has public read via existing policies (posts are public data)
- Lazy loaded in `App.tsx` with route `/feed`

---

## 3. Add "Live Feed" to Top Nav Menu

In `SiteLayout.tsx`, add to `NAV_ITEMS`:
```
{ label: 'Live Feed', path: '/feed', tooltip: 'Live Feed' }
```

---

## 4. Nav Menu Styling — Distinguish Active vs Inactive

Current inactive items use `text-muted-foreground` which may be too similar. Will adjust to use a lighter opacity (e.g., `text-muted-foreground/70`) for inactive items to create clearer visual distinction from the active state.

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/pages/Feed.tsx` | **Create** — full feed page with search, views, pagination |
| `src/components/layout/SiteLayout.tsx` | **Edit** — add "Live Feed" nav item + lighten inactive nav color |
| `src/App.tsx` | **Edit** — add `/feed` route with lazy load |

No database migrations needed — all data already exists in `holders_intel_post_queue` + `holders_intel_seen_tokens`.

