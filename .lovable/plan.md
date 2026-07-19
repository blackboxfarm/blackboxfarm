## Goal
A new page at `/insiders-recaps` that shows every unique token that appeared in an Insiders "PREMIUM INSIDERS DAILY / WEEKLY / MONTHLY RECAP" pinned post over the last 60 days, with the token name, full CA, and its best (highest) X-gain across the window.

## Data source
`telegram_channel_calls` already stores every message from the Insiders channel, including recap posts. Confirmed formats present in the DB:

- Daily: `🗓 <Month D>` + `📌 PREMIUM INSIDERS DAILY RECAP` (Top 10)
- Weekly: `🗓 <D1> - <D2>` + `🤫 PREMIUM INSIDERS WEEKLY RECAP` (Top 10)
- Monthly: `🗓 <Month 1>` + `💃 PREMIUM INSIDERS MONTHLY RECAP` (Top 10)

Each entry inside a recap has the shape:
```
👑 590x $GOBLIN
$30.6k => $18.1M
3KHMZhpthXuiCcgfTv7vVu9PpEz64KAEURFwi6Lopump
```

No scraping needed — everything is already ingested.

## Implementation

1. New Supabase edge function `insiders-recaps-list` (verify_jwt = false, read-only)
   - Selects distinct-on-message_id recap rows from `telegram_channel_calls` where `channel_name ILIKE 'insiders'`, `message_timestamp > now() - interval '60 days'`, and `raw_message ILIKE '%INSIDERS%RECAP%'`.
   - Parses each `raw_message` line-by-line with a small regex block:
     - multiplier: `/([\d.]+)x\s*\$?([A-Za-z0-9_]+)/`
     - entry/current MC: `/\$([\d.,]+[kKmMbB]?)\s*=>\s*\$([\d.,]+[kKmMbB]?)/`
     - CA: `/([1-9A-HJ-NP-Za-km-z]{32,44})/` (Solana base58; accept `*pump` and non-pump)
   - Classifies recap type from the header emoji (📌 daily / 🤫 weekly / 💃 monthly).
   - Dedupes across all 60 days by `token_mint`, keeping the highest multiplier and the recap it came from.
   - Returns JSON: `{ tokens: [{ mint, ticker, best_multiplier, entry_mc, peak_mc, recap_type, recap_date, message_id }], stats: { total_recaps, unique_tokens, daily_count, weekly_count, monthly_count } }`

2. New page `src/pages/InsidersRecaps.tsx` + route in `src/App.tsx`
   - Calls the edge function on mount.
   - Renders a sortable table:
     - Ticker | Full CA (with copy button + DexScreener link) | Best X | Entry MC | Peak MC | Recap Type | Recap Date
   - Filter chips: All / Daily / Weekly / Monthly.
   - Search box (ticker or CA substring).
   - Sort by Best X desc by default; column-header click to resort.
   - Header count: `N unique tokens across M recaps (last 60 days)`.
   - Tailwind + existing shadcn table components — matches the app's dark aesthetic.

3. No DB migration required. No writes. No new secrets.

## Technical notes
- Recap posts are sometimes reposted (same `message_id`, different `created_at` — see May 1 monthly recap). `DISTINCT ON (message_id)` in SQL handles it.
- Ticker in `$GOBLIN` becomes `GOBLIN` (strip leading `$`).
- Multiplier stored as float; display as `590×`.
- CA validation: reject anything under 32 chars or containing non-base58 chars.
- Page is read-only, publicly accessible (same tier as `/wtf`).

## Out of scope
- No auto-refresh / realtime — page fetches once on load with a manual Refresh button.
- No CSV export in v1 (easy add later if wanted).
- No cross-check against first-seen dates (that was the earlier July-18 task).
