# 🧠 Daily Engineering Report — February 17, 2026
## "What We Did Today" — Lovable AI Session Summary

**Prepared by:** Lovable AI Engineering Assistant  
**Session Duration:** Full day session  
**Project:** BlackBox Farm — Pump.fun Automated Trading Intelligence Platform  
**Platform:** Supabase Edge Functions + React + TypeScript

---

## Executive Summary

Today was a high-density engineering session focused on **hardening the Pump.fun token trading pipeline** — specifically around preventing bad entries, detecting artificial hype, and building post-exit intelligence. We shipped multiple edge functions, database migrations, UI components, and cron automations. The session also involved several important **course corrections** where initial assumptions were challenged and revised based on domain expertise.

Key themes:
1. **Entry Quality Gates** — Preventing the system from buying into tokens that are declining after discovery
2. **Comment Bot Detection** — Identifying artificial hype campaigns on Pump.fun token pages
3. **Post-Exit Intelligence** — Tracking what happens to tokens after we sell them (both wins and losses)
4. **Developer Reputation Feedback** — Ensuring winning trades still contribute to dev reputation scoring
5. **Daily Operational Workflow** — Building a guided wizard for daily system review

---

## Part 1: Discovery Price Gate — Preventing Downward Momentum Entries

### The Problem

The system was discovering tokens at one price, then buying them later at a *lower* price — meaning the token was already in decline. This is a classic trap: if the price has dropped since we first noticed the token, buying in is catching a falling knife.

### What We Built

A configurable **hard gate** in the Fantasy Executor edge function (`pumpfun-fantasy-executor`) that blocks any buy where the entry price is below the price at which we originally discovered the token.

### Technical Decision: Hard Gate vs. Soft Signal

We chose a **hard gate** (complete block) rather than a soft signal (score penalty) because:
- A token trading below its discovery price is a strong negative signal
- The system already has plenty of soft scoring — this needed to be binary
- Configuration allows fine-tuning via percentage threshold

### How It Works

```
Discovery Price: $0.000045 (when we first saw the token)
Current Price:   $0.000038 (when executor tries to buy)
Result:          🚫 BLOCKED — price has declined since discovery
```

The gate is controlled by two config values in `pumpfun_monitor_config`:
- `block_below_discovery_enabled` (boolean, default: true)
- `block_below_discovery_pct` (number, default: 0) — allows a small tolerance buffer

### Data Tracking

Every trade now records in its `entry_flags` JSONB column:
- Whether the discovery gate was checked
- The discovery price at time of check
- Whether the token was blocked or passed

This gives us a data trail to evaluate the gate's effectiveness over time.

---

## Part 2: Comment Bot Scanner — Detecting Artificial Hype

### The Problem

Pump.fun token pages have comment sections that are frequently targeted by bot networks. These bots post hype messages ("this is going to moon!", "iykyk", "send it") to create artificial social proof and lure retail buyers. We needed a system to detect this activity and factor it into our qualification pipeline.

### What We Built

A new edge function (`pumpfun-comment-scanner`) that:
1. Scrapes a token's Pump.fun comment page using **Firecrawl** (a web scraping API)
2. Analyzes each comment for bot signals
3. Calculates a `comment_bot_score` (0-100) for the token
4. Tracks commenter accounts across multiple tokens to identify repeat bot operators

### Detection Signals — What We Use

**Shill Phrase Matching:**
The scanner checks comments against 30+ known hype phrases commonly used by bot networks:
- "iykyk" (if you know you know)
- "send it"
- "setup is there"
- "aping in"
- "next 100x"
- "dev based"
- And many more

**Cross-Token Message Duplication:**
This is the most powerful signal. The scanner uses SHA-256 hashing to fingerprint every comment, then checks if the same message (or near-identical variants) appear on other token pages. A commenter posting "this is the one 🚀" on 15 different tokens in one day is almost certainly a bot.

### Critical Course Correction: Username Entropy

**Initial approach (REJECTED):** We originally included username entropy scoring as a bot detection signal. The idea was that random-looking usernames like `fnfpbp` or `eg7vvb` indicate bot-generated accounts.

**Why it was rejected:** The human operator (project owner) correctly identified that **Pump.fun assigns random usernames to all new accounts by default**, and most users never change them. This means random-looking usernames are the *norm*, not a bot signal. Using this as a detection metric would flag the majority of legitimate users.

**Final decision:** 
- ✅ We **still collect** username entropy as metadata (it's interesting data)
- ❌ We do **NOT** use it in the bot score calculation
- ❌ We do **NOT** use it to block or flag tokens
- ✅ We do use it for **pattern analysis** — grouping usernames and looking for coordinated behavior across tokens

This was an important lesson: **domain expertise overrides algorithmic assumptions.** What looks like a signal in isolation (random usernames = bots) is actually baseline behavior on this platform.

### No Blocking — Observation Mode Only

**Another key decision:** The comment bot score is currently **informational only**. It does not block token purchases or affect qualification scoring. 

The rationale: We need to see how the scoring performs in production before trusting it to make automated decisions. We might find that many legitimate tokens have high bot scores (because bot networks target everything), or that our shill phrase list generates false positives.

The plan is to:
1. Collect data for several days/weeks
2. Analyze correlation between bot scores and token outcomes
3. Only then consider using it as a trade filter

### Database Architecture

Two new tables were created:

**`pumpfun_token_comments`** — Raw comment data per token:
- Comment text, username, timestamp
- Bot signals detected (shill phrases, duplicates)
- SHA-256 content hash for deduplication

**`pumpfun_comment_accounts`** — Cross-token account tracking:
- Unique commenter usernames
- Number of distinct tokens they've commented on
- Whether they've been flagged as a bot
- Links back to individual comments

A new column `comment_bot_score` was added to `pumpfun_watchlist` to store the per-token score.

### Copycat Post Detection (Message Comparison)

At the operator's request, we specifically implemented a **message comparison detector** that identifies copy-paste campaigns. This works by:

1. Hashing every comment with SHA-256
2. Storing hashes in `pumpfun_comment_accounts`
3. When scanning a new token, checking if any comment hashes match existing entries from *other* tokens
4. Flagging accounts that post identical content across multiple tokens

This catches both exact duplicates and bot networks that distribute the same messages across their targets.

---

## Part 3: Comment Scanner Backfill — Automated Historical Processing

### The Problem

We had hundreds of existing tokens in the watchlist that had never been scanned for comment bot activity. Manually triggering scans one-by-one was impractical.

### What We Built

A **cron-based backfill system** that automatically processes unscanned tokens:

- **Cron job:** `pumpfun-comment-scanner-backfill`
- **Schedule:** Every 10 minutes
- **Batch size:** 3 tokens per run
- **Rate limiting:** 1-second delay between tokens within a batch

### Why Rate Limiting Matters

Pump.fun (like most platforms) will throttle or block IP addresses that make too many requests too quickly. By processing only 3 tokens every 10 minutes with delays between each, we stay well under any reasonable rate limit threshold. This is roughly 18 tokens per hour, or ~430 per day — enough to work through the backlog without triggering anti-scraping measures.

### Selection Logic

The backfill selects tokens where:
- `comment_scan_at IS NULL` (never been scanned)
- Status is one of: `watching`, `qualified`, `buy_now` (active pipeline tokens)
- Ordered by creation date (oldest first, to prioritize historical backfill)

---

## Part 4: Post-Exit Win Analysis — What Happened After We Sold?

### The Problem (Two Critical Gaps)

**Gap 1 — No post-exit tracking for wins.** When we sell at 1.5x or 2x profit, we had no idea what happened next. Did the token go to $150K market cap? Did it die 6 minutes later after the dev rugged? This data is essential for developing smarter exit strategies (moonbags, hold-to-graduate, etc.).

Real example: Token EMCC — we sold for profit, but it may have continued running to much higher levels. Without tracking, we'll never know if our exit timing was optimal.

Real example: Token POLYCLAW — we sold for profit, but the dev may have rugged 6 minutes later. Without tracking, a rugger gets no negative reputation marks because "we made money."

**Gap 2 — Winning trades never update dev reputation.** The sell monitor's `target_hit` code path (profitable exit) never called the reputation feedback system. This means:
- A dev whose token gave us 1.5x but then rugged gets zero negative marks
- A dev whose token graduated to Raydium after our exit gets zero positive marks
- Dev reputation was only updated on *losses*, creating a biased picture

### What We Planned

A new edge function `backcheck-profit-exits` (running every 4 hours) that:

1. Fetches all closed positions with positive PnL that haven't been checked yet
2. Looks up current token price via Pump.fun API (with DexScreener fallback)
3. Backfills `creator_wallet` from `pumpfun_watchlist` (179 winning positions were missing this)
4. Classifies each into a post-exit outcome:

| Outcome | Criteria | Dev Reputation Impact |
|---------|----------|----------------------|
| **Continued Runner** | Price went 3x+ beyond our exit | ✅ Positive marks |
| **Graduated** | Completed bonding curve to Raydium | ✅ Positive marks |
| **Stable** | Price stayed 0.8x-1.5x of exit | ➖ No change |
| **Died** | Price dropped below 50% of exit | ❌ Negative marks |
| **Dev Rugged Post-Exit** | Died + dev wallet shows exit pattern | ❌ Blacklist candidate |

### The Key Insight

**A dev who gives us a quick 1.5x profit but then rugs the token is still a bad actor.** Getting lucky on timing doesn't redeem their character. The system now treats these devs the same as if we had lost money — because the next time, we might not be so lucky with our exit timing.

### UI Component: Profit Exit Backcheck

A new review tab (`ProfitExitBackcheck.tsx`) was planned for the Pump.fun Monitor showing:
- Summary stats across all outcome categories
- Detailed table with exit price, current price, post-exit multiplier, graduation status
- Filter by outcome category
- Manual "Flag Dev" button for edge cases
- Direct links to Pump.fun for each token

---

## Part 5: Daily Opening Wizard — Operational Workflow

### The Problem

With so many automated systems running (10+ cron jobs), manual backchecks, and daily review tasks, it was easy to forget steps or miss important signals. The operator needed a structured daily workflow.

### What We Built

A **7-step guided wizard** (`DailyOpeningWizard.tsx`) that the operator walks through each morning:

#### Step 1: 📊 Overnight Summary
- How many positions are open?
- How many closed in the last 24 hours?
- Any stop-loss exits? Any profit exits?
- Check the Candidates tab for new qualified tokens

#### Step 2: 🔄 Stop-Loss Recovery Review
- Which tokens hit stop-loss overnight?
- Did any of them recover? (Recovery tab)
- Are stop-losses too tight on certain token types?
- Automated by: `backcheck-stop-loss-4h` cron

#### Step 3: 🚫 Rejected Tokens Backcheck
- How many tokens were rejected in the last 24 hours?
- Did any rejected tokens moon? (False negatives)
- Use data to tune qualification thresholds
- Automated by: `backcheck-rejected-6h` cron

#### Step 4: 💰 Profit Exit Review
- Did we exit too early on any profitable trades?
- Compare exit price vs current price
- If many tokens kept pumping after exit, consider loosening trailing stops
- Links to the Retrace tab for detailed analysis

#### Step 5: 🤖 Comment Bot Scanner Status
- How many tokens still need comment scanning?
- Review bot detection results
- Key signals: shill phrases + cross-token duplicate messages
- Reminder: Username entropy is metadata-only, NOT a bot signal
- Automated by: `comment-scanner-backfill` cron (every 10 min)

#### Step 6: 🚧 Discovery Price Gate Check
- Is the new gate working correctly?
- Check `entry_flags` on recent trades for "below_discovery" blocks
- Review any tokens that were blocked — were the blocks correct?
- Automated by: Built into the Fantasy Executor

#### Step 7: 👁️ Watchlist Health
- How many tokens are in the pipeline?
- Are tokens flowing through stages correctly?
- Pipeline: `pending_triage` → `watching` → `qualified` → `buy_now`
- Automated by: Multiple 1-minute cron jobs

### Real-Time Stats

The wizard fetches live data from Supabase to populate each step:
- Total and open position counts
- 24-hour close/exit statistics
- Pending comment scan count
- Recent rejection count
- Active watchlist size

### Cron Job Dashboard

The wizard includes a summary of all 10 active cron jobs with their schedules, providing visibility into what's running automatically:

| Job | Schedule |
|-----|----------|
| pumpfun-new-token-monitor | Every 1 min |
| pumpfun-watchlist-monitor | Every 1 min |
| pumpfun-fantasy-executor | Every 1 min |
| pumpfun-fantasy-sell-monitor | Every 1 min |
| pumpfun-dev-wallet-monitor | Every 3 min |
| pumpfun-global-safeguards | Every 5 min |
| backcheck-stop-loss-4h | Every 4 hours |
| backcheck-rejected-6h | Every 6 hours |
| comment-scanner-backfill | Every 10 min |
| developer-integrity-hourly | Every 1 hour |

---

## Part 6: Technical Architecture Decisions Summary

### Decision Log

| # | Decision | Chosen Direction | Alternative Considered | Rationale |
|---|----------|-----------------|----------------------|-----------|
| 1 | Discovery price comparison | Hard gate (block) | Soft score penalty | Binary signal — if price declined since discovery, momentum is negative |
| 2 | Username entropy in bot detection | Metadata only, no scoring | Full bot signal | Pump.fun assigns random names by default — high entropy is normal |
| 3 | Comment bot score usage | Informational only | Auto-block high scores | Need production data before trusting automated decisions |
| 4 | Backfill rate limiting | 3 tokens / 10 min | Aggressive (50+/min) | Avoid Pump.fun rate limiting/IP blocks |
| 5 | Copycat detection method | SHA-256 content hashing | Fuzzy text matching | Exact match is sufficient and computationally cheap |
| 6 | Dev reputation on wins | Update reputation post-exit | Only update on losses | A rugger is a rugger regardless of our exit timing |
| 7 | Daily workflow | Guided wizard UI | Simple checklist | Wizard provides context, tips, and live stats per step |
| 8 | Scraping technology | Firecrawl API | Direct HTTP scraping | Handles JavaScript rendering, bypasses anti-bot measures |

### Course Corrections Made During Session

1. **Username entropy as bot signal → Rejected.** Domain expertise correctly identified that Pump.fun's default random usernames make entropy useless as a standalone signal. We kept it as metadata for pattern analysis but removed it from scoring.

2. **Immediate bot-based blocking → Deferred.** The operator wisely chose observation mode first. We collect the data, review it, and only implement blocking after validating the signals against real outcomes.

3. **Manual backchecks → Automated crons.** Several tasks that would have required daily manual triggers were moved into automated cron jobs during this session, reducing the daily manual workload to high-level review and decision-making.

---

## Part 7: Database Changes (Migrations)

### New Tables
- `pumpfun_token_comments` — Raw scraped comments with bot signal analysis
- `pumpfun_comment_accounts` — Cross-token commenter tracking

### Modified Tables
- `pumpfun_watchlist` — Added `comment_bot_score` and `comment_scan_at` columns
- `pumpfun_monitor_config` — Added `block_below_discovery_enabled` and `block_below_discovery_pct`
- `banker_pool_trades` — Post-exit tracking columns planned

### New Cron Jobs
- `pumpfun-comment-scanner-backfill` — Every 10 minutes, 3 tokens/batch

### RLS Policies
All new tables have Row Level Security enabled with appropriate read/write policies.

---

## Part 8: Files Created & Modified

### New Files
| File | Purpose |
|------|---------|
| `supabase/functions/pumpfun-comment-scanner/index.ts` | Comment scraping and bot detection edge function |
| `src/components/admin/CommentBotScanner.tsx` | Bot detection review UI |
| `src/components/admin/DailyOpeningWizard.tsx` | Daily operational wizard |

### Modified Files
| File | Changes |
|------|---------|
| `supabase/functions/pumpfun-fantasy-executor/index.ts` | Added discovery price gate logic |
| `src/components/admin/tabs/PumpfunMonitorTab.tsx` | Added Daily Wizard and Profit Exits tabs |
| `src/components/admin/TwitterScrapesView.tsx` | Integrated Comment Bots tab |

---

## Closing Notes

Today's session represents a significant maturation of the trading intelligence pipeline. We moved from reactive (wait for losses, then analyze) to **proactive** (prevent bad entries, detect manipulation, track all outcomes). The key philosophical shift: **every trade outcome — win or loss — generates intelligence that feeds back into the system.**

The most important non-technical takeaway: **Domain expertise matters more than algorithmic cleverness.** The username entropy correction is a perfect example — a statistically sound signal that is meaningless in the specific context of this platform. Building effective automated systems requires deep understanding of the domain, not just the data.

*— Generated by Lovable AI, February 17, 2026*
