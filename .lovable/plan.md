

# AI-Powered Contextual Nudge Mesh — Sitewide Implementation

## What This Does

Transforms The Signal's ambient thought bubbles from hardcoded quips into an **AI-driven, page-aware contextual nudge system** that reacts to where the user is, what they're looking at, how long they've been idle, and whether they're anonymous or logged in. The avatar becomes a smart guide across every public-facing page — driving conversions for anon visitors and providing FAQ/feature guidance for logged-in users.

## Architecture

```text
┌─────────────────────────────────────────────────┐
│  Page Components (Home, Feed, Pricing, etc.)    │
│  ┌──────────────────────────────────────┐       │
│  │ data-oracle-hint="..."               │◄──────── Static anchor points (hover-triggered)
│  │ data-oracle-zone="..."               │       │
│  └──────────────────────────────────────┘       │
│                                                 │
│  ┌──────────────────────────────────────┐       │
│  │ usePageNudgeOrchestrator() hook      │◄──────── NEW: Per-page idle/scroll/journey nudges
│  │  - watches route, idle time, scroll  │       │
│  │  - picks nudge from page config      │       │
│  │  - respects nudgesEnabled toggle     │       │
│  │  - fires dispatchThoughtCustom()     │       │
│  └──────────────────────────────────────┘       │
│                                                 │
│  ChatWidget (existing)                          │
│   └─ AvatarThoughtBubble (existing)             │
└─────────────────────────────────────────────────┘
```

## Two Nudge Layers

### Layer 1: Static Anchor Points (`data-oracle-hint` / `data-oracle-zone`)
Already exists via `OracleHoverProvider` — fires on mouse dwell over marked elements. Currently only 3 pages have anchors. We'll add ~25 more across all public pages.

### Layer 2: Dynamic Page Nudge Orchestrator (NEW)
A new hook `usePageNudgeOrchestrator` that runs inside `ChatWidget` and:
- Detects current route + auth state (anon vs free vs paid)
- Fires contextual thought bubbles on idle (12-20s intervals)
- Has per-page nudge pools with different pools for anon (conversion) vs logged-in (guidance)
- Tracks scroll depth to trigger scroll-based nudges ("keep scrolling — pricing breakdown below")
- Caps at 3-4 nudges per page visit, resets on route change
- Respects the existing `nudgesEnabled` toggle (Ctrl+Space / "/")

## Detailed Changes

### 1. New file: `src/hooks/usePageNudgeOrchestrator.ts`

Core logic:
- A config map keyed by route pattern (exact or prefix match)
- Each route has `anonNudges: string[]`, `authNudges: string[]`, `scrollNudges: { depth: number, text: string }[]`
- Idle timer fires first nudge after 10s on page, subsequent nudges every 18s
- Scroll listener fires nudges when user crosses depth thresholds (25%, 50%, 75%)
- Returns nothing — just dispatches `signal-thought` events
- Max 4 nudges per page visit, stored in a ref

**Page nudge config (examples):**

| Route | Anon Nudge Examples | Auth Nudge Examples |
|-------|-------------------|-------------------|
| `/` (Home) | "sign up free — unlock AI analysis", "500+ tokens tracked daily" | "try the Bubble Map — it's wild", "check the Live Feed for fresh tokens" |
| `/feed` | "create a free account to get alerts", "these tokens update in real-time" | "click any token for deep analysis", "sort by health grade to find the gems" |
| `/holders` | "sign up to save your searches", "this is the free preview — imagine Pro" | "try the AI tab for narrative analysis", "check the wallet tab for dev history" |
| `/subscriptions` | "X subscribers save on every plan", "1 bubblemap per day is free" | "Pro unlocks unlimited bubble maps", "the AI risk engine catches what you miss" |
| `/bubblepromo` | "1 free deep scan per day — make it count", "paste any token address above" | *(redirects to /bubblemap)* |
| `/bubblemap` | — | "try Deep Spider for the full mesh", "switch views with Solar Cluster" |
| `/pricing` | "curious about Pro? ask me anything", "X subscribers get a discount" | "you can upgrade anytime — no lock-in" |
| `/tgbot` | "the bot works in group chats too", "try /quick in Telegram — it's instant" | "link your Telegram for cross-platform intel" |

### 2. Expand `data-oracle-hint` anchors across pages

Add hover-triggered anchor points to key UI elements on every public page:

**Home.tsx** (~6 new anchors):
- Hero CTA button: "I can help you run your first token check"
- Product pillar cards: "Ask me about holder analysis / Telegram bot / Bubble Map"
- Testimonial section: "Real users, real results — want to try it?"
- Tier comparison: "Not sure which plan? I can help"

**Feed.tsx** (~4 new anchors):
- Search input: "Search by name, symbol, or paste a contract address"
- Health grade column: "Health grades are AI-calculated — ask me how"
- Token row actions: "Click any token to see the full breakdown"
- Sort controls: "Sort by health grade to surface the strongest tokens"

**Subscriptions.tsx** (~4 new anchors):
- Tier cards section: "Want me to compare these plans for you?"
- X subscriber verification: "Link your X account here to unlock discounts"
- Feature list: "Each feature stacks — free gets you started, Pro goes deep"
- FAQ section: "Still have questions? Just ask me"

**Holders.tsx** (~3 new anchors):
- Token input: already exists
- AI Analysis tab: "The AI panel gives you a narrative summary — try it"
- Wallet trace section: "This traces the dev's funding chain back to KYC"

**TelegramBot.tsx** (~2 new anchors):
- Bot link: "Click to open the bot in Telegram — it's instant"
- Command list: "Try /quick first — it's free and fast"

### 3. Integrate orchestrator into `ChatWidget.tsx`

- Import and call `usePageNudgeOrchestrator()` inside `ChatWidget`
- Pass `nudgesEnabled`, `fabVisible`, `isOpen` as params so it knows when to fire
- The hook handles all timing internally

### 4. Minor Enhancement: AI-generated nudges (optional future phase)

For now, all nudges are static string pools (fast, zero-cost, no API calls). A future enhancement could call the Lovable AI gateway with page context to generate dynamic nudges, but that adds latency and cost per impression — not recommended for v1.

## What Makes This Better Than Current State

- **Current**: 3 pages have hover anchors, BubbleMap has scripted journey, everything else is silent
- **After**: Every public page has idle nudges + hover anchors + scroll nudges, differentiated by auth state
- **Conversion path**: Anon visitors get soft conversion nudges; logged-in users get feature discovery
- **Non-annoying**: 4 nudge cap per page, 18s cooldown, respects Ctrl+Space toggle, goes silent after cap

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/hooks/usePageNudgeOrchestrator.ts` | **CREATE** — core orchestrator hook |
| `src/components/chat/ChatWidget.tsx` | **MODIFY** — integrate orchestrator |
| `src/pages/Home.tsx` | **MODIFY** — add ~6 `data-oracle-hint` anchors |
| `src/pages/Feed.tsx` | **MODIFY** — add ~4 anchors |
| `src/pages/Subscriptions.tsx` | **MODIFY** — add ~4 anchors |
| `src/pages/Holders.tsx` | **MODIFY** — add ~3 anchors |
| `src/pages/Pricing.tsx` | **MODIFY** — add ~2 anchors |
| `src/pages/TelegramBot.tsx` | **MODIFY** — add ~2 anchors |
| `src/pages/BubblePromo.tsx` | **MODIFY** — add ~2 anchors |

No database changes. No edge function changes. No new dependencies.

