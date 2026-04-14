

# Intel Briefings — Publishing Blueprint Plan

## Cleanup
Delete 2 duplicate articles (keeping the originals):
- `who-really-holds-that-token-the-question-every-solana-trader-should-ask-first` (duplicate of the Apr 1 original)
- `what-is-holder-distribution-and-why-it-predicts-every-rug-pull-before-it-happens2` (duplicate)

**Result: 34 unique articles**

## Mental Ramp Strategy

After reading all 34 articles, here is the strategic publishing order organized into phases that build a reader's trust progressively — from "I have a problem" to "this tool solves it" to "I need the advanced version."

### Phase 1: Problem Awareness (Nov 2025 — 6 articles)
Hook readers with pain they already feel. No product pitch yet — just credibility.

| # | Wed Date | Article | Why Here |
|---|----------|---------|----------|
| 1 | Nov 5 | Why Most Crypto Traders Lose Money (And How to Stop It) | Universal pain point, widest audience |
| 2 | Nov 12 | The Truth About "1000+ Holders" Tokens | Myth-busting, shareable, builds curiosity |
| 3 | Nov 19 | The Difference Between Real Volume and Fake Volume | Another myth everyone falls for |
| 4 | Nov 26 | Why Liquidity Alone Doesn't Make a Token Safe | Completes the "everything you trust is wrong" trilogy |
| 5 | Dec 3 | How to Spot Fake Decentralization in Crypto Projects | Deepens the "nothing is what it seems" thread |
| 6 | Dec 10 | Speed vs Structure: Why Fast Traders Still Lose | Pivots from "what's broken" to "what's better" |

### Phase 2: Solution Framework (Dec–Jan — 6 articles)
Introduce the *concepts* BlackBox is built on — holder analysis, wallet tracing, bubble maps.

| # | Wed Date | Article | Why Here |
|---|----------|---------|----------|
| 7 | Dec 17 | What Is Holder Distribution and Why It Predicts Every Rug Pull | Core concept introduction |
| 8 | Dec 24 | Who Really Holds That Token? | The flagship question — reader is now ready for it |
| 9 | Jan 1 | How to Analyze Token Holders Before You Buy | Actionable follow-up |
| 10 | Jan 8 | What Is a Bubble Map and Why It Matters in Crypto | Introduces the visual tool concept |
| 11 | Jan 15 | Inside the Mind of Smart Money: Wallet Behavior Explained | Elevates the reader's thinking |
| 12 | Jan 22 | How to Detect a Rug Pull Before It Happens | High-intent safety content |

### Phase 3: Tool Introduction (Jan–Feb — 6 articles)
Now the reader knows the concepts — show them BlackBox does this.

| # | Wed Date | Article | Why Here |
|---|----------|---------|----------|
| 13 | Jan 29 | What Is a Crypto Wallet Analysis Tool (And Why You Need One) | Category education → product |
| 14 | Feb 5 | The Best Crypto Wallet Analysis Tool for Investors | Direct product positioning |
| 15 | Feb 12 | How BlackBox Farm's AI Risk Score Works — And Why It's Different | Core differentiator |
| 16 | Feb 19 | What Is a Crypto Bubble Map? How BlackBox Farm's Network Graph Exposes Hidden Connections | Product-specific bubble map |
| 17 | Feb 26 | The 7 Red Flags in Any Token's Holder Data | Practical framework using BBox |
| 18 | Mar 5 | How to Read the Bubble Map: A Complete Visual Guide | Tutorial — converts interest to usage |

### Phase 4: Deep Intelligence (Mar — 4 articles, completes the "22 backdated")
Advanced capabilities for readers now invested in the platform.

| # | Wed Date | Article | Why Here |
|---|----------|---------|----------|
| 19 | Mar 12 | Dev Wallet Tracing: How to Know If the Developer Has Done This Before | Advanced capability |
| 20 | Mar 19 | Shadow Networks: How Coordinated Wallet Clusters Hide in Plain Sight | Deep intel |
| 21 | Mar 26 | KYC Root Tracing: The Deep Scan That Finds the Master Wallet | Most advanced feature |
| 22 | Apr 2 | Token → Dev → Funder → KYC Root: The Chain Every Smart Trader Should Pull | Capstone of the tracing series |

### Phase 5: Future Posts (Apr 9 onward — 12 articles)
These are scheduled as `is_published = false` with future Wednesday dates.

| # | Wed Date | Article | Why Here |
|---|----------|---------|----------|
| 23 | Apr 9 | Recycled Identities: How Scammers Keep Coming Back | Bridges to community safety |
| 24 | Apr 16 | Social-to-On-Chain Mapping: Why Your Token's Twitter Admin Matters | Social intel angle |
| 25 | Apr 23 | How AI Is Changing Crypto Trading Forever | Broader AI narrative |
| 26 | Apr 30 | The Best Telegram Bot for Crypto Analysis — @holdersintel_bot Reviewed | TG bot intro |
| 27 | May 7 | How to Use @holdersintel_bot: Every Command Explained | Tutorial |
| 28 | May 14 | /risk vs /ai vs /oracle: Choosing the Right Command | Power user guide |
| 29 | May 21 | Why Traders Are Adding @holdersintel_bot to Their Group Chats | Social proof |
| 30 | May 28 | Telegram Bots for Crypto Analysis: Are They Worth It? | Category piece |
| 31 | Jun 4 | Free vs Pro: What You Actually Get With BlackBox Farm's Tiers | Conversion content |
| 32 | Jun 11 | Is the Bubble Map Free? Everything About Access & Pricing | Pricing FAQ |
| 33 | Jun 18 | BlackBox Farm vs The Rest: Why Serious Traders Use a Different Tool | Competitive moat |
| 34 | Jun 25 | Stop Trading Charts. Start Reading Wallets. The Manifesto. | Manifesto as culmination |

## Implementation Steps

1. **Delete 2 duplicate records** via Supabase insert tool (DELETE)
2. **Update all 34 articles** — set `published_at` to the assigned Wednesday dates and `is_published = true` for articles 1–22, `is_published = false` for articles 23–34
3. **Verify** the public `/intel` page shows the 22 published articles in correct order

## Why This Order Works
- **Weeks 1–6**: Reader thinks "I've been doing this wrong" — no product mention, pure trust-building
- **Weeks 7–12**: Reader learns the *frameworks* (holder analysis, bubble maps) — still educational
- **Weeks 13–18**: Reader discovers BlackBox *does* all of this — natural product introduction
- **Weeks 19–22**: Reader sees the advanced capabilities — positions BlackBox as best-in-class
- **Weeks 23+**: Telegram bot series, pricing, manifesto — conversion and community content

