

## 4-Part Delivery: Cron Registration, Classifier vs Autopsy Analysis, Death Taxonomy, Thought Bubbles

### 1. Deploy reconcile-cron-jobs to register the two new cron entries

The code already has `oracle-auto-classifier-15min` and `token-autopsy-30min` entries in `REQUIRED_CRONS`. I will invoke the deployed `reconcile-cron-jobs` function directly — it will detect the missing entries and create them via `cron.schedule()`.

| Action | Detail |
|--------|--------|
| Call `reconcile-cron-jobs` via `curl_edge_functions` | POST with `{}` body — it self-discovers missing crons and restores them |
| Verify | Check response for `restored` array containing both new job names |

No code changes needed — just an invocation.

---

### 2. Oracle Auto-Classifier vs Token Autopsy — Overlap Analysis

**They are complementary, not duplicates.** Here's the waterfall:

```text
ORACLE AUTO-CLASSIFIER (wallet-level, every 15 min)
─────────────────────────────────────────────────────
INPUT:  Unanalyzed wallets from token_lifecycle (oracle_analyzed = false)
STEP 1: Resolve creator wallet for each token
STEP 2: Parallel fetch: developer_profiles + dev_wallet_reputation + developer_tokens
STEP 3: Build stats object:
         ├─ totalTokens (from profile or token count)
         ├─ rugPulls (from profile or reputation table)
         ├─ slowDrains (from profile or reputation table)
         ├─ successfulTokens (from profile or outcome='success')
         └─ avgLifespanHours (from profile)
STEP 4: Score calculation (base 50, penalties + bonuses):
         ├─ -30 per rug pull
         ├─ -20 per slow drain
         ├─ -15 if avg lifespan < 24hrs
         ├─ -20 if rug ratio > 50%
         ├─ +15 per successful token
         ├─ +20 if >60% success rate (with 5+ tokens)
         └─ +10 if avg lifespan > 1 week
STEP 5: Classification:
         ├─ score < 20 OR rugPulls > 0 → BLACKLIST (auto-insert pumpfun_blacklist)
         ├─ score > 70 AND successfulTokens ≥ 3 → WHITELIST (auto-insert pumpfun_whitelist)
         └─ else → NEUTRAL
STEP 6: Update developer_profiles.reputation_score
STEP 7: Mark all tokens by this wallet as oracle_analyzed = true

OUTPUT: Per-wallet score + classification + recommendation string

TOKEN AUTOPSY (token-level, every 30 min)
──────────────────────────────────────────
INPUT:  Dead tokens: autopsy_at IS NULL AND (mcap < 1000 OR liquidity < 500)
STEP 1: For each token, find creator_wallet via pumpfun_watchlist
STEP 2: Fetch dev_behavior_scores for that creator
STEP 3: Fetch holder_movements for the token
STEP 4: Diagnose cause of death:
         ├─ dump_velocity > 80 + age < 48hrs → RUG_PULL
         ├─ dump_velocity 40-80 + age > 48hrs → SLOW_DRAIN
         ├─ lp_pull_score > 70 → LIQUIDITY_PULLED
         ├─ risk_tier = bad_actor → RUG_PULL (fallback)
         ├─ age > 1 week + no dev data → ABANDONED
         ├─ low mcap + low liquidity + no malice → ORGANIC_DEATH
         └─ else → UNKNOWN
STEP 5: Write death_cause, death_confidence, autopsy_notes to token_lifecycle

OUTPUT: Per-token cause of death with confidence %
```

**Key difference**: The Classifier scores the **developer** (wallet-level reputation). The Autopsy diagnoses the **token** (individual coin cause of death). A single dev can have 10 tokens — the Classifier scores the dev once, the Autopsy examines each dead token individually. They feed different columns in `token_lifecycle` and are not redundant.

---

### 3. Comprehensive Token Death Taxonomy

Currently only 6 categories exist. Here is the full taxonomy of ~30 distinct methods a dev can damage/kill a token, grouped by intent:

**Active Malice (deliberate profit extraction)**
1. **Classic Rug Pull** — Dev dumps entire supply in one tx
2. **Multi-Wallet Rug** — Dev distributes to 5-10 wallets, dumps simultaneously
3. **Bundled Launch Rug** — Dev buys with bundled wallets at launch, dumps on real buyers
4. **LP Pull** — Dev removes liquidity pool entirely
5. **Partial LP Drain** — Dev removes 80% of LP, leaves a sliver
6. **Slow Bleed** — Dev sells 1-3% daily over weeks
7. **Mint Authority Exploit** — Dev mints new supply, diluting holders
8. **Freeze Authority Abuse** — Dev freezes buyer wallets, sells freely
9. **Honeypot** — Contract allows buys but blocks sells for everyone except dev
10. **Tax Manipulation** — Dev raises sell tax to 90%+ after launch
11. **Fake LP Lock** — Dev "locks" LP but uses a contract with backdoor unlock
12. **DEX Listing Refund Scam** — Dev pays for DEX listing, requests refund, pockets the money while telling community "DEX is having issues"
13. **Insider Pre-Load** — Dev's friends/wallets buy before announcement, dump on community
14. **Airdrop Dump** — Dev airdrops to create fake holder count, then dumps
15. **Migration Scam** — Dev announces "migration to V2", drains V1 LP, never delivers V2

**Passive Neglect (abandonment / broken promises)**
16. **Ghost Dev** — Dev stops all communication, no updates, socials go dark
17. **Roadmap Abandonment** — Dev delivered nothing from announced roadmap
18. **Social Media Abandonment** — Twitter/Telegram deleted or inactive 30+ days
19. **Website Takedown** — Domain expired or site removed
20. **Failed CEX Listing Promise** — Dev promised Tier 1 CEX listing, never delivered
21. **Team Dissolution** — Dev team members leave publicly, no replacement

**Structural Failures (poor design / incompetence)**
22. **Tokenomics Collapse** — Unsustainable emission/vesting schedule kills price
23. **Single Whale Dependency** — One holder owns 40%+, their exit kills the token
24. **Bot-Farmed Launch** — Token launched with 90% bot holders, all exit within hours
25. **Copy-Paste Contract** — Identical contract to known rug, community discovers and exits
26. **Failed Utility Delivery** — Product never shipped, holders lose faith organically

**External / Market Forces**
27. **Organic Death** — Natural decline, no buyers, no malice
28. **Market-Wide Crash** — Died during broader crypto downturn
29. **Regulatory FUD** — Killed by regulatory news or action
30. **Platform De-listing** — Removed from DEX or tracker

The current autopsy only detects categories 1, 6, 4, 16, and 27. The expanded taxonomy would require additional data signals (mint authority checks, tax rate monitoring, social activity tracking, LP lock verification). This is a Phase 2 expansion.

---

### 4. Avatar Thought Bubbles During Bubblemap Activity

Add a lightweight "thought bubble" system: when the user triggers a trace (KYC search, X community reveal, etc.), the floating avatar shows tiny cartoon-style thought bubbles with random quips.

| File | Change |
|------|--------|
| `src/components/chat/AvatarThoughtBubble.tsx` | New component: a small speech bubble that appears near the FAB avatar with a random 1-2 word quip, auto-fades after 2s. Styled as a classic cartoon thought bubble (rounded with tail dots) |
| `src/components/chat/ChatWidget.tsx` | Add `useEffect` listening for `CustomEvent('oracle-thought')`. When received, show `AvatarThoughtBubble` near the FAB position with the quip from `event.detail.text`. Only shows if FAB is visible and chat is closed |
| `src/components/bubble-map/PublicBubbleMap.tsx` | Dispatch `oracle-thought` events at key moments: KYC trace start ("tracing..."), chain discovery ("interesting..."), KYC found ("got it"), X community reveal ("nice..."), new nodes added ("new data :)"), cold trail ("hmm...") |

**Quip pool** (randomly selected per category):
- Trace start: "tracing...", "on it", "digging..."
- Discovery: "interesting...", "ooh", "new data :)"
- Success: "got it", "nice...", "found one"
- Cold trail: "hmm...", "cold trail", "deeper..."
- General: "yep, yep", "watching...", "noted"

The bubble appears as a small rounded div with 3 decreasing circles forming the thought-tail, positioned relative to the FAB avatar. Fades in/out with CSS animation. No interaction needed — purely decorative ambient feedback.

