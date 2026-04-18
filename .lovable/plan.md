

## What the user is asking for

User added two new TG channels to the monitor:
- One **VIP / paid** channel
- One **public (free)** channel

…from the *same operator* (or comparable operators). They want to:
1. **Read messages going forward** from both
2. **AI-compare the two posting patterns** — what they offer, how, when
3. Specifically understand **how/when the paid channel gets earlier/better calls** vs the free one (lead-time analysis)
4. Generate **hourly reports** on offerings and the **PnL outcomes** of the tokens each channel called
5. Surface it in a **new tab** in the admin Telegram Monitor, named **"Koreans"** (the user typed "Koreans" — I'll use that as the tab label)

## What we already have (no need to build)

- `telegram_channel_calls` already captures every call with: `channel_id`, `channel_name`, `token_mint`, `token_symbol`, `raw_message`, `price_at_call`, `market_cap_at_call`, `caller_username`, `message_timestamp`, `created_at`. The new channel `-1003282110418` (Iceds House of Degeneracy) is already producing rows. The second channel `-1003694579312` will start populating once it sees a token call.
- The monitor pipeline is running and writing to that table — no scraping changes needed.
- We have token price/PnL infra (`unified-pnl-monitor`, `dex-top-200` cache, `flip_positions`) we can reuse for outcome tracking.
- Existing Tabs structure in `src/components/admin/TelegramChannelMonitor.tsx` is plug-and-play (one new `<TabsTrigger>` + `<TabsContent>`).

## What needs to be built

### 1. New table: `channel_pair_comparison_runs` (hourly snapshots)
Stores one row per hour per pair with:
- `pair_id` (FK to a small `channel_comparison_pairs` table that maps the two channels — VIP & Public)
- `window_start`, `window_end` (the hour analyzed)
- `vip_call_count`, `public_call_count`
- `overlap_tokens` (jsonb array of tokens both channels called)
- `vip_lead_overlap` (jsonb: per overlapping token, seconds VIP posted earlier; negative = public was earlier)
- `vip_exclusives` / `public_exclusives` (tokens only one side called)
- `vip_avg_mcap_at_call`, `public_avg_mcap_at_call`
- `vip_pnl_summary`, `public_pnl_summary` (jsonb with avg multiplier, win rate, best/worst, computed using current price vs `price_at_call`)
- `ai_summary` (markdown text from Lovable AI Gateway)
- `ai_verdict` (enum-ish text: `vip_clearly_earlier` | `marginal_edge` | `no_edge` | `public_actually_earlier` | `insufficient_data`)

### 2. New table: `channel_comparison_pairs`
Tiny config table:
- `id`, `pair_name`, `vip_channel_id`, `public_channel_id`, `is_active`, `created_at`

User can register the pair from the new tab. (One pair = one VIP + one Public.)

### 3. New edge function: `channel-pair-analyzer` (cron, hourly)
- For each active pair, look at the last hour of `telegram_channel_calls` for both channel IDs
- Compute overlap, lead times (per `message_timestamp`), exclusives, mcap stats
- Pull current prices from `dex-top-200` cache (no API hits) → compute multiplier vs `price_at_call`
- Send a structured prompt to Lovable AI Gateway (`google/gemini-3-flash-preview`) with the pre-computed numbers — AI writes the human-readable hourly briefing and verdict
- `assertInsert` into `channel_pair_comparison_runs` (per zero-tolerance silent-fails rule)
- Schedule via `pg_cron` every hour at :05

### 4. New edge function: `channel-pair-analyze-now`
- On-demand version (button in the UI) — same logic but accepts `pair_id` + custom window (default 1h, max 24h)
- Returns the analysis without persisting (or persists as `is_manual=true`) so the user can hit "Analyze Now" without waiting for the cron

### 5. New tab: **"🇰🇷 Koreans"** in `TelegramChannelMonitor.tsx`
- One new `<TabsTrigger value="koreans">` + `<TabsContent>`
- New component `src/components/admin/telegram/KoreansComparison.tsx`:
  - **Pair setup card**: dropdown to pick VIP channel + Public channel from existing `telegram_channel_config` rows → save to `channel_comparison_pairs`
  - **Live stats strip**: last hour calls (VIP vs Public), overlap count, average lead time
  - **Hourly Reports timeline**: scrollable list of past `channel_pair_comparison_runs`, each card shows verdict badge + AI summary + expandable raw stats
  - **"Analyze Last Hour Now"** button → calls `channel-pair-analyze-now`
  - **Lead-time chart**: small bar chart per overlapping token (last 24h) — VIP lead in seconds, color-coded (green = VIP earlier, red = public earlier)
  - **PnL panel**: side-by-side table — avg multiplier, win rate (>1.5×), best call, worst call, for VIP vs Public

### 6. Wire-up bits
- Index export in `src/components/admin/telegram/index.ts`
- Cron schedule SQL (separate from migration — needs project ref + anon key)
- RLS: super-admin only on both new tables (matches existing admin-data-visibility-policies pattern)

## Files touched

**New**
- `supabase/migrations/<ts>_*.sql` — `channel_comparison_pairs`, `channel_pair_comparison_runs`, RLS, indexes
- `supabase/functions/channel-pair-analyzer/index.ts` — hourly cron worker
- `supabase/functions/channel-pair-analyze-now/index.ts` — on-demand
- `src/components/admin/telegram/KoreansComparison.tsx` — UI

**Edited**
- `src/components/admin/TelegramChannelMonitor.tsx` — add tab trigger + content
- `src/components/admin/telegram/index.ts` — export new component
- Cron registration via `psql` insert (separate, needs anon key + project ref)

## Out of scope (confirm if you want any of these)
- Auto-trading off the VIP signal (just observation/reporting for now)
- Cross-pair comparison (multiple VIP/Public pairs) — v1 supports multiple pairs but UI shows one at a time
- Sending the hourly report to Telegram/email — just stored in DB and shown in the tab for now
- Backfilling historical hours before the pair was registered

## Open question
You said "VIP paid" and "public" — am I right that you want to **register one pair** (VIP + Public from the same operator), or do you want to compare **all VIP-tagged channels vs all Public-tagged channels** as groups? My plan does the **pair** model (cleaner signal, easier to read). If you want group-mode let me know and I'll restructure.

**Tap "Plan Approved" to build it.** Or tell me which pieces to drop / which channel IDs are the pair.

