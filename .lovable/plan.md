

# Backend Gap Analysis: 4 Categories, 3 Missing Each + 1 ASAP

---

## A. Error Logs and Reports

### Missing 1 — Edge Function Execution Log Table (ASAP)
There is no centralized table tracking edge function invocations, durations, and errors. Every function uses `console.error` (286 files, 5900+ matches) which vanishes after Supabase's short log retention window. If a cron-triggered function silently fails at 3 AM, there is zero persistent record.

**Fix:** Create an `edge_function_runs` table (function_name, started_at, finished_at, duration_ms, status, error_message, invocation_source). Add a lightweight `logRun()` helper in `_shared/` that wraps every function's main handler. The morning report then queries this table instead of relying on ephemeral logs.

### Missing 2 — Dead Letter Queue for Failed Operations
No retry or dead-letter mechanism exists (`dead_letter|retry_queue|dlq` = 0 matches). When a Telegram alert fails to send, or a mesh upsert errors out, the data is lost. Failed allstar alerts, failed TG broadcasts, failed token enrichments — all silently dropped.

**Fix:** Create a `dead_letter_queue` table (id, source_function, payload, error, retry_count, next_retry_at, resolved_at). Failed critical operations insert here instead of swallowing errors. A `retry-dead-letters` cron processes retryable items every 10 minutes.

### Missing 3 — Error Pattern Aggregation and Trending
The morning report captures top errors per service, but there is no trending or comparison. You can't see "Helius 403 errors went from 2/day to 200/day this week." The `system-health-audit` checks a 1-hour and 6-hour window but doesn't track week-over-week trends.

**Fix:** Add a daily `error_trend_snapshot` table populated by `database-housekeeping`. Compare current-day error counts per service/endpoint against 7-day rolling average. Flag in the morning report when any error type is 3x+ above its baseline.

---

## B. Communication and Alerts

### Missing 1 — Alert Delivery Confirmation and Audit Trail
The `api-failure-alerts.ts` fires Telegram messages but has no tracking of whether they were actually delivered. The `broadcastToTelegram` call is fire-and-forget. If the TG bot token expires, all alerts silently die. Same for email notifications.

**Fix:** Add a `notification_delivery_log` table (notification_id, channel, status, response_code, delivered_at, error). Every TG/email send records its delivery status. The morning report includes a "delivery success rate" metric. Alert on >10% delivery failure.

### Missing 2 — Escalation Chain for Critical Alerts
There is a 10-minute cooldown per service in `api-failure-alerts.ts`, but no escalation. If Helius is down for 2 hours, you get one alert at minute 0 and then silence. No secondary channel (email, SMS) kicks in if TG delivery fails. No "still broken after 30 min" re-alert.

**Fix:** Add escalation tiers to the alert system: Tier 1 = TG (immediate), Tier 2 = Email (after 15 min if unresolved), Tier 3 = repeat TG with "STILL DOWN" prefix every 30 min. Track resolution via `admin_notifications.is_read` or a new `alert_acknowledged_at` field.

### Missing 3 — User-Facing Service Status Page
When Helius or pump.fun goes down, end users have no visibility. Bot replies fail silently, scans return stale data, but the user sees nothing.

**Fix:** Create a simple `service_status` table (service_name, status, last_checked_at, message) updated by `system-health-audit`. Expose via a lightweight `/service-status` endpoint or a status banner in the app when any service is degraded.

---

## C. API Usage, Sources, Rotation, and Costs

### Missing 1 — Monthly Quota Auto-Reset (ASAP)
`monthly_quota_used` in `api_service_config` is tracked but **never reset**. There is no cron, no migration, and no function that resets counters on the 1st of each month. The quota warnings will eventually fire permanently and become meaningless noise.

**Fix:** Add a `reset-monthly-quotas` cron job on the 1st of each month at 00:00 UTC. Before resetting, snapshot the final month's usage to a `monthly_usage_archive` table for historical tracking.

### Missing 2 — Actual Cost Tracking (Dollar Amounts)
The `SERVICE_CREDITS` map in `api-logger.ts` has rough estimates (Helius = 100, Solscan = 1) but no actual dollar conversion. The `token_analysis_costs` table stores credit counts but not dollar amounts. You can't answer "how much did we spend on Helius this month?"

**Fix:** Add `cost_per_credit_usd` to `api_service_config`. The morning report calculates estimated monthly spend per service. Add a `monthly_cost_estimate` field to the report output. This turns the existing credit data into actionable financial data.

### Missing 3 — Unlogged API Calls
Only 14 files use `createApiLogger`/`loggedFetch`. There are 200+ edge functions making external API calls — the vast majority are unlogged. Pump.fun calls, Jupiter quotes, Raydium swaps, Firecrawl scrapes, Apify actor runs — many bypass the logging system entirely.

**Fix:** Audit all edge functions making `fetch()` calls to external services. Priority targets: `pumpfun-token-fetcher`, `jupiter` calls in swap functions, `raydium-quote`, `firecrawl-scrape`, `helius-rpc-proxy`. Wrap each with `createApiLogger` or `loggedFetch`. This is a multi-session effort — start with the highest-cost services (Helius, Apify, Solscan).

---

## D. Collected Metrics from Token Spidering and Scaling

### Missing 1 — Spider Run Metrics Dashboard Table
The `oracle-master-spider` (1155 lines) returns rich `SpiderResult` objects with `meshUpdates`, `discoveredTokens`, `discoveredSocials`, and genealogy depth. But none of this is aggregated. There is no table tracking "today we spidered 45 tokens, discovered 120 new wallets, added 30 mesh links, found 8 blacklisted devs."

**Fix:** Create a `spider_run_metrics` table (run_date, tokens_spidered, wallets_discovered, mesh_links_added, blacklist_hits, whitelist_hits, avg_genealogy_depth, avg_run_time_ms). Populate from each spider invocation. Surface in morning report.

### Missing 2 — Token Discovery Funnel Metrics
Tokens flow through: funnel-feed-scanner → pumpfun-token-fetcher → enricher → watchlist → vigil → post-mortem. But there is no funnel tracking. You can't see "of 500 tokens discovered yesterday, 200 passed enrichment, 50 made watchlist, 12 died, 3 hit 100K mcap."

**Fix:** Create a `token_funnel_daily` table (date, stage, count). Each pipeline stage increments its counter. The morning report includes a funnel visualization showing conversion rates between stages. This is critical for understanding if your filters are too aggressive or too loose.

### Missing 3 — Mesh Growth and Coverage Metrics
The `mesh_summary` materialized view exists but is never queried by any reporting function. There is no tracking of mesh growth over time — total wallet-to-wallet links, total social identities mapped, total developer profiles, coverage percentage of spidered vs unspidered tokens.

**Fix:** Add mesh growth metrics to the morning report: query `mesh_summary` (or the underlying tables) for total links, total identities, new links added in the last 24h. Create a `mesh_growth_daily` snapshot table populated by housekeeping. This shows whether the mesh is growing, stagnant, or degrading.

---

## The 1 ASAP Priority: Edge Function Execution Log Table (Category A, Item 1)

This is the single highest-impact gap. With 200+ edge functions, 40+ cron jobs, and zero persistent execution logging, you are effectively flying blind. When something breaks overnight, the morning report can only tell you about API call failures that happened to be logged — not which functions ran, which failed, or which silently timed out. Every other gap (error trends, cost accuracy, spider metrics) becomes easier to solve once you have a centralized execution log to build on.

**Implementation approach:**
1. Create `edge_function_runs` table via migration
2. Create `_shared/run-logger.ts` with a `withRunLog(functionName, handler)` wrapper
3. Wrap the top 15 highest-frequency cron functions first
4. Add a "Function Health" section to the morning report querying this table
5. Roll out to remaining functions over subsequent sessions

