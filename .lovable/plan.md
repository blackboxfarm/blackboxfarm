## Goal

Make the daily Bubble Map quota crystal clear to anonymous visitors and bump signed-in users from 1/day to 3/day, with prominent Sign-Up CTAs.

## Tier limits (new)

| Tier | Daily Traces |
|------|--------------|
| Anonymous (not signed in) | **1** |
| Signed-in Free | **3** |
| Pro / Subscriber | **Unlimited** |

A "Trace" = one click of the **Trace** button on a fresh token/wallet/handle. After that, on the same target the user can freely: Find KYC Root, Map X Community, toggle Prune/Branches/Solar Min/Solar Cluster, pan/zoom, click nodes, open Hacker Terminal — none of these consume quota.

## Changes

### 1. `src/hooks/useBubbleMapRateLimit.ts`
- `DAILY_LIMIT_ANON = 1` (unchanged)
- `DAILY_LIMIT_FREE_AUTH = 3` (was 1)
- `DISPLAY_LIMIT` becomes dynamic (1 for anon, 3 for signed-in free, ∞ for pro) so the "X left today" UI is correct.
- Return `tierLabel: 'anon' | 'free' | 'pro'` so UI can render the right copy.

### 2. `src/components/bubble-map/PublicBubbleMap.tsx` — Rate Limit Banner (lines ~993–1023)

Replace the current banner with a tier-aware version:

- **Title** changes by tier:
  - Anon: `"1 Free Trace per day — no sign-up needed"`
  - Signed-in Free: `"3 Traces per day on your free account"`
  - When exhausted: `"Daily Traces used — come back tomorrow or upgrade"`
- Show `remaining / limit` counter ("2 of 3 left today").
- Add an **info icon** (`Info` from lucide) right next to the title. On hover (desktop) it opens a `HoverCard`; on click (mobile/all) it opens a `Dialog` modal. Same content in both:

  > **What counts as "1 use"?**
  >
  > One click of the **Trace** button on a token/wallet/handle = your daily counter ticks up by 1.
  >
  > After that initial Trace, on the **same** target you can still freely:
  > - Click **Find KYC Root** (deep genealogy hop search)
  > - Click **Map X Community** (social discovery)
  > - Toggle **Prune / Branches / Solar Min / Solar Cluster**
  > - Pan, zoom, click nodes, open the **Hacker Terminal**
  >
  > **Daily limits**
  > - Anonymous: **1** Trace / day
  > - Signed-in Free: **3** Traces / day
  > - Subscriber: **Unlimited**
  >
  > [Sign Up Free] [Subscribe $9.99/mo]

- CTA row in the banner:
  - Anon: `[Sign Up Free → 3/day]` + `[Subscribe — Unlimited]`
  - Free: `[Subscribe — Unlimited]`
  - Pro: hidden (banner not shown).

### 3. Second info trigger near the Trace button (lines ~1056–1063)
Add a small `Info` icon button immediately to the right of the **Trace** button that opens the same modal/hover-card. This places the explainer exactly where the user is about to spend their quota.

### 4. Tooltip on disabled state
When `!canSearch`, the Trace button gets a tooltip: `"You've used today's Traces. Sign up free for 3/day or subscribe for unlimited."` with inline links.

### 5. Reusable component
Extract the explainer into `src/components/bubble-map/DailyTraceInfo.tsx` exporting:
- `<DailyTraceInfoTrigger variant="hover" | "icon">` — renders the Info icon + HoverCard + Dialog fallback.
- Internally shows the markdown above and the two CTA buttons (`/auth`, `/subscriptions`).

This avoids duplicating copy between the banner and the Trace button.

## Out of scope (not changing now)
- Server-side enforcement of the limit (still localStorage). Memory note flags this as a known soft limit; can be hardened later if requested.
- Pro subscriber UI (no banner shown).

## Files touched
- `src/hooks/useBubbleMapRateLimit.ts` — bump free-auth limit, dynamic display limit, tier label
- `src/components/bubble-map/PublicBubbleMap.tsx` — banner copy, info triggers, CTA wiring
- `src/components/bubble-map/DailyTraceInfo.tsx` — new shared explainer component
