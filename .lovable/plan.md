# /nolube — Bot Scrape Variable Coverage Review

## Goal
After the two BlackBox.Farm group bots (rick, Phanes_bot, etc.) reply to a posted CA and their messages are parsed into `blackbox_bot_replies.parsed_jsonb`, give you a per-token view that shows the **full menu of variables we know how to extract** (from `NormalizedBotFields` in `supabase/functions/_shared/blackbox-parsers/types.ts`), each rendered as either **filled** (with value + which bot supplied it) or **blank** (nothing captured). Historical, browsable, per scrape run.

## Data already in place — no schema changes
- `blackbox_aggregator_runs` — one row per CA posted → harvest window (token_mint, posted_at, status, replies_collected, digest_jsonb).
- `blackbox_bot_replies` — one row per bot message inside a run (`run_id`, `bot_username`, `parser_used`, `raw_text`, `parsed_jsonb`, `received_at`, `edit_count`).
- `NormalizedBotFields` type = the canonical menu of ~35 variables (identity, market, safety/tax, distribution, age, ATH/freshness, socials, extras).

Everything needed already exists. This is a read-only reporting surface.

## New route: `/nolube`
Add page `src/pages/NoLube.tsx`, register in `src/App.tsx`. Behind existing super-admin guard (matches the rest of BlackBox admin surfaces).

### Layout — two panes

**Left: Runs list** (paginated, newest first)
- Pulls `blackbox_aggregator_runs` ordered by `posted_at desc`, 50/page.
- Row shows: ticker (from newest reply's `parsed_jsonb.symbol` or mint short), token_mint (copyable), posted_at, status, replies_collected, and a **coverage bar** = `filledFieldCount / totalFieldCount` across the union of all reply `parsed_jsonb` for that run.
- Filters: search by mint/ticker, status (`pending|complete|timeout|error`), date range, "only runs with < N% coverage".

**Right: Selected run detail**
- Header: token_mint, ticker, posted_at, harvest window, status, list of bots that replied with `parser_used` badge + `edit_count`.
- **Variable Menu (the core deliverable):** bulleted list of every key in `NormalizedBotFields`, grouped by section (Identity / Market / Safety & Tax / Distribution / Age / ATH & Freshness / Socials / Extras). For each variable:
  - `{var_name}` in mono, human label beside it
  - If any reply supplied it: green dot, value (formatted — $ / % / raw), and small chips showing which bot(s) supplied it and whether they agreed or diverged (show all distinct values if they differ).
  - If no reply supplied it: grey dot, "— not captured".
- **Per-bot raw view** (collapsed accordion per reply): `bot_username`, `parser_used`, `received_at`, raw message text, and the raw `parsed_jsonb` pretty-printed. Lets you eyeball what the parser missed vs. what was in the text.
- **Extras panel:** anything landing in `parsed_jsonb.extras` (fields the parser saw but has no canonical slot for) — surfaced so you can decide whether to promote them into `NormalizedBotFields`.

### Coverage math
- `FIELD_MENU` constant in the page mirrors `NormalizedBotFields` keys (grouped, with labels + formatter hints). Single source of truth for the bullet list, coverage bar, and section headers.
- A field counts as "filled" if **any** reply in the run has a non-null / non-empty value for it.

## Data access
Frontend-only reads via `supabase-js` against existing tables (both are super-admin-readable per current RLS on `blackbox_*`). No edge function needed; no new tables; no writes.

Query pattern per selected run:
```
select * from blackbox_bot_replies where run_id = :id order by received_at asc
```
List query:
```
select id, token_mint, posted_at, status, replies_collected
from blackbox_aggregator_runs
order by posted_at desc limit 50 offset :o
```

## Files to add / touch
- `src/pages/NoLube.tsx` — the page (list + detail, coverage calc, field menu constant).
- `src/App.tsx` — register `/nolube` route behind `SuperAdminRoute`.
- Optional link entry in `src/components/admin/tabs/BlackBoxTab.tsx` (small button "Open /nolube") for discoverability.

## Non-goals (explicit)
- No changes to scraping, parsing, or storage.
- No new DB migration.
- No editing of `NormalizedBotFields`; if variables are missing that you want to start collecting, that's a follow-up plan.
