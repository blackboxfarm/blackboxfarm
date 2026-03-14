

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
