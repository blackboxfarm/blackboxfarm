

# HoldersIntel Bot — Full Command Suite with Tier Gating

## What You Gave Me (BotFather Commands)

Based on the conversation and your existing bot, here's the command list I'm building around:

```text
/start        — Welcome & setup
/register     — Link BlackBox Farm account
/status       — Check subscription tier
/help         — Show commands
/holders CA   — Holder distribution analysis
/momentum CA  — Volume/price momentum score
/verdict CA   — Quick Buy/Hold verdict
/oracle CA    — Developer reputation lookup
/wallet ADDR  — Wallet behavior analysis
/alerts       — Manage alert preferences
```

## Tier Gating Matrix

```text
Command       │ Free │ Auth │ X Sub │ Pro  │ Dev
──────────────┼──────┼──────┼───────┼──────┼─────
/start        │  ✓   │  ✓   │   ✓   │  ✓   │  ✓
/register     │  ✓   │  ✓   │   ✓   │  ✓   │  ✓
/status       │  ✓   │  ✓   │   ✓   │  ✓   │  ✓
/help         │  ✓   │  ✓   │   ✓   │  ✓   │  ✓
/holders CA   │  —   │ lite │ full  │ full+│ full+
/momentum CA  │  —   │  —   │  ✓    │  ✓   │  ✓
/verdict CA   │  —   │ lite │  ✓    │  ✓   │  ✓
/oracle CA    │  —   │  —   │  —    │  ✓   │  ✓
/wallet ADDR  │  —   │  —   │  —    │  ✓   │  ✓
/alerts       │  —   │  —   │  ✓    │  ✓   │  ✓
```

- **Free (unlinked)**: Only meta commands. Everything else says "link your account first."
- **Auth (linked, free tier)**: `/holders` returns a lite summary (holder count, top 10% concentration, health score). `/verdict` returns just the color (🟢/🔴) with no detail.
- **X Subscriber**: Full `/holders` with tier breakdown + distribution bars. `/momentum` unlocked. `/verdict` with sizing recommendation.
- **Pro+**: `/oracle` dev reputation, `/wallet` behavior analysis, full detail on everything.

## The `/verdict` System (Your Buy Signal)

The verdict combines momentum score + holder health + dev reputation into a single actionable call:

```text
🟢 BUY DEEP LONG    — Strong chart, healthy holders, good dev. Full position, hold.
🟢 BUY MEDIUM SHORT — Decent momentum, ride the wave. Medium position, 2x target.
🟡 BUY SMALL SHORT  — Speculative. Small/disposable amount, quick 2x flip.
🔴 HOLD / AVOID     — Weak signals, bad dev, or dump in progress. Skip.
```

The logic:
- Momentum score ≥ 70 + health score ≥ 60 + dev GREEN → **DEEP LONG**
- Momentum score ≥ 55 + health score ≥ 40 → **MEDIUM SHORT**
- Momentum score ≥ 40 OR fresh token with buying pressure → **SMALL SHORT**
- Everything else → **HOLD/AVOID**

## Technical Implementation

All new commands will be added to the existing `holdersintel-bot-webhook/index.ts` edge function. Each analytical command calls the existing edge functions internally via `supabase.functions.invoke()`:

| Bot Command | Calls | Data Source |
|---|---|---|
| `/holders CA` | `token-ai-interpreter` | Helius holder data + bucketing |
| `/momentum CA` | `token-momentum-analyzer` | DexScreener live metrics |
| `/verdict CA` | `token-momentum-analyzer` + `token-ai-interpreter` + `oracle-unified-lookup` | Combined score |
| `/oracle CA` | `oracle-unified-lookup` | Dev reputation mesh |
| `/wallet ADDR` | `wallet-behavior-analysis` | Helius transaction history |
| `/alerts` | DB read/write on user preferences | `telegram_link_codes` or new prefs table |

### Rate Limiting
Each analytical command will be rate-limited per user (e.g., 5 lookups/hour for X Sub, 20/hour for Pro) to prevent API abuse. Tracked via a simple counter in the `telegram_link_codes` table or a lightweight `telegram_bot_usage` table.

### New DB Table
`telegram_bot_usage` — tracks per-user command usage for rate limiting:
- `id`, `telegram_user_id`, `command`, `token_mint`, `created_at`

### Response Formatting
All responses formatted as Telegram Markdown with ASCII bar charts for distributions (same style as the XBot channel posts), keeping messages under Telegram's 4096 char limit.

## Files Changed
1. **`supabase/functions/holdersintel-bot-webhook/index.ts`** — Add handlers for `/holders`, `/momentum`, `/verdict`, `/oracle`, `/wallet`, `/alerts`. Add tier gating middleware. Add rate limiting.
2. **DB migration** — Create `telegram_bot_usage` table for rate limiting.
3. **Update `/help`** — Show tier-appropriate command list per user.

