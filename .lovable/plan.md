

# Feature Audit: What's Real vs. What's Fantasy

Here's the honest breakdown of every feature listed on the pricing table, whether it actually works, and what needs to be built.

---

## REAL — Actually Working

| Feature | Tier Listed | Status |
|---------|-------------|--------|
| **Basic Holder Report** | All | Working. Core report with holder table, wallet types, LP detection |
| **Health Grade & Score** | All | Working. Health grade component renders for all users |
| **AI Quick Summary** | All | Working. `AISummaryTeaser` shows `{ai_summary}` for anon users |
| **Reports per Day** | Varies | Partially working. Limits are defined in the tier config but enforcement is unclear — the rate limit may not actually block requests |
| **Full AI Panel** | Auth+ | Working. `AIInterpretationPanel` renders for logged-in users with summary, lifecycle badge, status overview |
| **Whale Warnings** | Auth+ | Working. Whale wallet detection and warnings exist in the report |
| **Key Drivers Analysis** | Pro+ | Working AND gated. Shows lock icon + "Pro feature" CTA for non-Pro users. Pro users see the full collapsible section with driver labels, metrics, and implications |
| **Reasoning Trace** | Pro+ | Working AND gated. Same pattern as Key Drivers — locked for sub-Pro, expandable for Pro+ |
| **CSV Export** | Pro+ | Working but NOT gated. The export button is visible and functional for ALL users, including free/anon. Anyone can click it and download the CSV right now |
| **X Subscriber Verification** | X Sub | Working. `XSubscriberVerification` component exists, community code redemption flow works |
| **Stripe Checkout** | Pro/Dev/Ent | Working. `create-checkout` and `check-subscription` edge functions exist, pricing table triggers checkout |
| **Manage Subscription** | Paid | Working. Customer portal integration exists |

---

## FANTASY — Listed But Not Built

| Feature | Tier Listed | What's Missing |
|---------|-------------|----------------|
| **AI Overview (detailed)** | X Sub+ | No distinct "overview" content level exists. X subscribers see the same AI panel as auth users. The `{ai_overview}` variable exists for X community posts but there's no separate web UI section that shows a richer "overview" vs. the standard "analysis" |
| **Wallet Clustering** | X Sub+ | Does not exist. No clustering algorithm, no UI component, no data. The first buyer section is hidden (`className="hidden"`) and the wallet clustering concept has zero implementation |
| **First Buyer Intel** | X Sub+ | Data is fetched (`firstBuyers` array) but the entire section is wrapped in `className="hidden"` and `{false && ...}` — literally hardcoded to never render. Not gated by tier, just completely hidden |
| **Comparison Charts** | Pro+ | Does not exist. No token comparison UI, no multi-token chart component, no data fetching for cross-token comparisons |
| **API Access** | Dev+ | Does not exist. The `/api` landing page explicitly says "Coming Soon". No API endpoints, no API keys, no documentation |
| **Webhooks** | Dev+ | Does not exist as a user-facing feature. Helius webhooks exist internally for whale monitoring but there's no user-configurable webhook system |
| **Team Seats** | Enterprise | Does not exist. No team/org model, no invite system, no multi-user account management |
| **Priority Support** | Enterprise | No support system exists. No ticket system, no priority queue, nothing |
| **White Label** | Enterprise | Does not exist. No customization, no branding options |

---

## PARTIALLY BROKEN — Exists But Has Gaps

| Feature | Issue |
|---------|-------|
| **CSV Export** | Works for everyone but is listed as Pro-only. No tier gate wrapping the button — any user can export |
| **First Buyer Intel** | Data is fetched from the backend but the UI is force-hidden with `{false && ...}`. Could be unblocked quickly |
| **Reports per Day limit** | Tier config defines `maxReportsPerDay` but I don't see enforcement logic that actually blocks a user after N reports |

---

## Summary Scorecard

- **Real and properly gated:** 5 features (Basic Report, Health Grade, AI Summary, Key Drivers, Reasoning Trace)
- **Real but not gated properly:** 2 features (CSV Export available to everyone, rate limits not enforced)
- **Data exists but UI hidden:** 1 feature (First Buyer Intel)
- **Pure fantasy on the pricing page:** 7 features (AI Overview differentiation, Wallet Clustering, Comparison Charts, API Access, Webhooks, Team Seats, Priority Support)

---

## Recommended Priority to Close the Gap

1. **Gate CSV Export** behind Pro tier — quick fix, currently giving away a "Pro" feature for free
2. **Unhide First Buyer Intel** and gate it behind X Sub tier — data already flows, just needs the `hidden` removed and a `TierGate` wrapper
3. **Enforce reports-per-day limits** — add actual counting/blocking logic
4. **Build Comparison Charts** — this is the most visible Pro feature gap
5. **Differentiate AI Overview for X Subs** — show a richer panel section for X subscribers vs auth users
6. **Mark API, Webhooks, Team Seats, Priority Support as "Coming Soon"** on the pricing table rather than showing green checkmarks, so you're not advertising features that don't exist

