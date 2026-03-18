

# HoldersIntel Bot — Full Command Suite with Tier Gating

## Command List (Updated)

```text
/start           — Welcome & setup
/register        — Link BlackBox Farm account
/status          — Check subscription tier
/help            — Show commands
/risk (/r) CA    — Composite risk & stability assessment
/holders CA      — Holder distribution analysis
/concentration CA — Detailed holder % breakdown
/dev (/d) CA     — Developer intel & social doxxing
/ca CA           — Default holder analysis
/quick (/q) CA   — Fast holder count & key stats
/ai CA           — Descriptive AI analysis snapshot
/momentum (/m) CA — Volume & price momentum scoring
/insiders (/i) CA — Insider cluster & bundling pre-check
/compare (/cmp) CA CA — Side-by-side token comparison
/alerts          — Manage alert preferences
/oracle (/o) CA  — Full developer reputation mesh (Pro)
/wallet (/w) ADDR — Wallet behavior analysis (Pro)
```

**Removed from UI:** `/verdict` — functions retained internally but not exposed in help or command routing.

## Tier Gating Matrix

```text
Command         │ Free │ Auth │ X Sub │ Pro  │ Dev
────────────────┼──────┼──────┼───────┼──────┼─────
/start          │  ✓   │  ✓   │   ✓   │  ✓   │  ✓
/register       │  ✓   │  ✓   │   ✓   │  ✓   │  ✓
/status         │  ✓   │  ✓   │   ✓   │  ✓   │  ✓
/help           │  ✓   │  ✓   │   ✓   │  ✓   │  ✓
/risk CA        │  —   │ lite │ full  │ full+│ full+
/holders CA     │  —   │ lite │ full  │ full+│ full+
/concentration  │  —   │  ✓   │  ✓    │  ✓   │  ✓
/dev CA         │  —   │ base │ full  │ full │ full
/ca CA          │  —   │  ✓   │  ✓    │  ✓   │  ✓
/quick CA       │  —   │  ✓   │  ✓    │  ✓   │  ✓
/ai CA          │  —   │  ✓   │  ✓    │  ✓   │  ✓
/momentum CA    │  —   │  —   │  ✓    │  ✓   │  ✓
/insiders CA    │  —   │  —   │  ✓    │ full │ full
/compare CA CA  │  —   │  —   │  ✓    │  ✓   │  ✓
/alerts         │  —   │  —   │  ✓    │  ✓   │  ✓
/oracle CA      │  —   │  —   │  —    │  ✓   │  ✓
/wallet ADDR    │  —   │  —   │  —    │  ✓   │  ✓
```

## Group Chat Features

- **Auto-Scan**: When someone pastes a Solana CA (no command prefix) in an activated group, the bot waits 3 seconds (lets other bots like Phanes fire first), then replies with a minimalist risk snippet.
- Requires paid channel installation (`channel_installations.is_paid = true`).
- Snippet includes: health score, holder count, top 10% concentration, MCap, and a link to `/risk` for full report.

## /insiders Maturity Skip Logic

If a token is >72 hours old AND >$500k MCap, the `/insiders` command returns a notification that early-stage bundling data is no longer actionable, and suggests using `/holders` or `/risk` instead.

## /dev vs /oracle

- `/dev` (Auth tier) — Developer-focused: social doxxing, launch history, performance stats, social links, identity mesh. Designed to showcase the "who is this dev" angle.
- `/oracle` (Pro tier) — Full reputation mesh: deeper mesh connections, funding chains, comprehensive relationship mapping. Token-focused intelligence.

---

# Backend Gap Analysis — Implementation Status

## ✅ Phase 1: Foundation (COMPLETED)

### A. Error Logs and Reports
- [x] **edge_function_runs** table — tracks every function invocation with duration, status, errors
- [x] **dead_letter_queue** table — retryable failed operations with exponential backoff
- [x] **error_trend_snapshot** table — daily error aggregation per service/endpoint
- [x] **run-logger.ts** shared helper — `withRunLog()` wrapper and `createRunLogger()` 
- [x] **dead-letter.ts** shared helper — `enqueueDeadLetter()` for failed operations
- [x] **retry-dead-letters** edge function — processes DLQ items every 10 min
- [x] **cleanup functions** — `cleanup_edge_function_runs()` and `cleanup_dead_letter_queue()`

### B. Communication and Alerts
- [x] **notification_delivery_log** table — tracks TG/email delivery status
- [x] **service_status** table — real-time service health (public read policy)

### C. API Usage, Sources, Rotation, Costs
- [x] **monthly_usage_archive** table — historical monthly usage snapshots
- [x] **cost_per_credit_usd** column added to api_service_config

### D. Spidering and Scaling Metrics
- [x] **spider_run_metrics** table — per-run aggregation of spider outcomes
- [x] **token_funnel_daily** table — token pipeline stage tracking
- [x] **mesh_growth_daily** table — daily mesh size snapshots

### Instrumented Functions (14 total)
- [x] pumpfun-orchestrator
- [x] trading-orchestrator
- [x] intel-xbot-start
- [x] morning-report
- [x] system-health-audit
- [x] database-housekeeping
- [x] allstar-mint-auditor
- [x] oracle-master-spider
- [x] holders-intel-poster
- [x] holders-intel-scheduler
- [x] holdersintel-bot-webhook
- [x] kol-registry-sync
- [x] enrich-scraped-tokens
- [x] telegram-bot-health
- [x] retry-dead-letters

## ✅ Phase 2: Integration (COMPLETED)

### A. Error Logs
- [x] Add "Function Health" section to morning report querying edge_function_runs
- [x] Wire `enqueueDeadLetter()` into telegram-broadcast.ts for failed sends
- [x] Populate error_trend_snapshot from database-housekeeping daily
- [x] Roll out `withRunLog` to 16 more functions (31 total instrumented)

### B. Communication
- [x] Wire notification_delivery_log into telegram-broadcast.ts send results
- [ ] Add escalation chain (Tier 1→2→3) for persistent outages
- [ ] Create /service-status endpoint from service_status table
- [x] Update system-health-audit to write to service_status

### C. API Costs
- [x] Add monthly quota auto-reset cron (1st of month at 00:05 UTC)
- [x] Populate cost_per_credit_usd values for paid services (Helius, Apify, Firecrawl)
- [ ] Audit + wrap top unlogged API calls with createApiLogger

### D. Metrics
- [x] Instrument oracle-master-spider to write spider_run_metrics
- [x] Add funnel stage counters to funnel-feed-scanner (discovered), pumpfun-token-enricher (enriched/watchlisted/rejected), token-vigil (dead)
- [x] Created shared funnel-tracker.ts helper + DB RPC functions (increment_spider_metrics, increment_funnel_stage)
- [x] Populate mesh_growth_daily from database-housekeeping
- [x] Add spider/funnel/mesh sections to morning report
- [x] Add DLQ stats section to morning report
- [x] Add function health + DLQ sections to TG report message

## Remaining (Future Sessions)
- [ ] Roll out withRunLog to remaining ~200 edge functions
- [ ] Add escalation chain for persistent outages
- [ ] Create /service-status API endpoint
- [ ] Audit + wrap top unlogged API calls with createApiLogger
