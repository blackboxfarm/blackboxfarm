You are right: for the Korean funnel path, “Watchlist inserted” currently does not mean “enriched with decision data.” It only means a bare `pumpfun_watchlist` row was created. That is why `$Palestine` can show a good Telegram holder report while the Pump.fun tab still shows holders/price/ATH as empty or zero.

What I verified for `$Palestine` (`42YqRMkgj4GRDN3JrvYrw8VCoZoL1Ddodc44U7Avpump`):

- `funnel_feed_discoveries`
  - source: `솔라나 펌핑 파티`
  - `watchlist_status`: `inserted`
  - `mesh_status`: `completed`
  - `xpost_status`: `posted`
  - no `dex_data`, no `creator_wallet`
- `pumpfun_watchlist`
  - source: `funnel_feed:솔라나 펌핑 파티`
  - status: `pending_triage`
  - `check_count`: `1`
  - `holder_count`: `0`
  - `holder_count_peak`: `0`
  - `volume_sol`: `0`
  - `price_usd`, `price_ath_usd`, `market_cap_usd`, `ath_market_cap_usd`, `bonding_curve_pct`, `creator_wallet`: all null
- `holders_intel_seen_tokens`
  - `health_grade`: `C`
  - `market_cap_at_discovery`: `14001`
  - `was_posted`: true
- `token_health_snapshots`
  - 11:00 snapshot from poster: 465 holders, 412 real, grade B+, top10 20.45%, dust 11%
  - later snapshots also exist
- `token_lifecycle`
  - has an `ath_24h_usd` value only
  - does not have symbol/name/price/mcap/liquidity filled for this token
- `reputation_mesh`
  - has useful links for creator/community/social evidence, including creator wallet and X community links

So the data exists in other tables, but the spreadsheet is looking at `pumpfun_watchlist`, and the funnel path never hydrates that table after posting/analysis.

Plan to fix it:

1. Rename/clarify statuses in the UI
   - Make the tab stop implying that `watchlist inserted` means “tracked and enriched.”
   - Display a clear badge/column like:
     - `Inserted only`
     - `Holder report done`
     - `Mesh links found`
     - `Price/ATH missing`
     - `Autopsy-ready`

2. Backfill/enrich `pumpfun_watchlist` after a funnel token is processed
   - When `holders-intel-poster` or `bagless-holders-report` calculates holder stats, write the important decision fields back to `pumpfun_watchlist`:
     - `holder_count`
     - `holder_count_peak`
     - `market_cap_usd`
     - `price_usd` when available
     - `ath_market_cap_usd` / `price_ath_usd` when available
     - `creator_wallet` when resolved
     - `social_score` / `rugcheck`/risk fields if available
     - `last_snapshot_at`
     - `last_processor`
   - Do this with `assertDbWrite` for every DB write touched, per the project zero-silent-fail rule.

3. Enrich at funnel insertion time too
   - In `funnel-feed-scanner`, after extracting a mint, fetch basic pump.fun/DexScreener metadata before inserting into `pumpfun_watchlist`.
   - Fill whatever is immediately available instead of inserting a mostly empty row.
   - If metadata fetch fails, store a visible reason/processor marker instead of pretending the row is useful.

4. Add a “decision data source” view to the spreadsheet
   - The spreadsheet should not only show raw `pumpfun_watchlist` columns.
   - Add joined/derived columns from:
     - `token_health_snapshots` for holder/grade/dust/top10 history
     - `holders_intel_seen_tokens` for posted/seen/market-cap-at-discovery
     - `token_lifecycle` for ATH/death/autopsy fields
     - `funnel_feed_discoveries` for mesh/watchlist/xpost states
     - `reputation_mesh` summary counts for creator/community/social links
   - For `$Palestine`, that means the table would show the 465-holder / B+ Telegram-post snapshot instead of zero holders.

5. Add filters that match the real workflow
   - Default to useful decision candidates, not raw junk:
     - source includes `funnel_feed:*`
     - exclude `rejected`
     - show tokens with holder snapshots or posted funnel evidence first
   - Add quick filters:
     - `Funnel feed only`
     - `Missing price/ATH`
     - `Has holder snapshot`
     - `Posted to Telegram`
     - `Autopsy candidates`
     - `Inserted only / not enriched`

6. Add a per-token trace drawer
   - Clicking a row should show a timeline for that mint:
     - discovery source/message
     - watchlist insert timestamp/status
     - mesh completion timestamp and links count
     - post queue status
     - Telegram/X post status
     - holder snapshots
     - lifecycle/ATH/autopsy state
   - This answers “where is the fucking data?” directly inside the admin UI.

Technical details:

```text
Current Korean funnel flow

funnel_feed_sources
  -> funnel-feed-scanner reads Telegram messages
  -> funnel_feed_discoveries insert
       watchlist_status = pending
       mesh_status = pending
       xpost_status = pending
  -> meshFeed.token(...)
       writes/queues reputation_mesh only if enough evidence exists
       then scanner marks mesh_status = completed
  -> pumpfun_watchlist insert
       status = pending_triage
       source = funnel_feed:<source_name>
       currently only mint/symbol/name/source/status timestamps
  -> holders_intel_post_queue insert
  -> holders-intel-poster runs holder report
       writes holders_intel_seen_tokens
       writes token_health_snapshots
       writes token_lifecycle ATH only
       posts Telegram
       does NOT hydrate pumpfun_watchlist metrics
```

The core bug is not that the Telegram stats are fake. The bug is that they are stored in `token_health_snapshots` / `holders_intel_seen_tokens`, while the visible spreadsheet is reading `pumpfun_watchlist`, which was only used as a raw insertion pool and was never updated with the analysis output.