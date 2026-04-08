

## Fix `/bubblemaps` → `/bubblemap` + Enrich AI Bubblemap Knowledge

### Problem

1. **Wrong URL everywhere**: The route is `/bubblemap` (singular) but all AI prompts, Telegram bot links, knowledge base sync, and the chat widget reference `/bubblemaps` (plural). Every link the AI generates for Bubblemaps is a 404.

2. **AI undersells Bubblemaps**: The current prompt describes it vaguely as "wallet visualization." It says nothing about developer reputation tracking across projects, Dev Wallet → social handle (X/Twitter) cross-linking, token launch history mapping, wallet bundle detection, or good/bad actor scoring — which is the core value proposition.

### Changes

**File 1: `supabase/functions/web-chat/index.ts`**
- Lines 329-330: Fix `/bubblemaps` → `/bubblemap` in the INTERNAL LINKS block
- Add a new `## BUBBLEMAP DEEP KNOWLEDGE` section after INTERNAL LINKS explaining what Bubblemaps actually does: developer reputation across projects, Dev Wallet tracing, X handle cross-linking, wallet bundle/sybil detection, KYC root tracing, good/bad actor scoring, token launch history mapping

**File 2: `supabase/functions/holdersintel-bot-webhook/index.ts`**
- Lines 1351, 1919, 1956, 2237: Fix all `bubblemaps?token=` link URLs to `bubblemap?token=`
- Lines 2830-2831: Fix INTERNAL LINKS block URLs
- Add same `## BUBBLEMAP DEEP KNOWLEDGE` block to the TG bot's `handleAiFreeChat` prompt assembly

**File 3: `supabase/functions/sync-knowledge-base/index.ts`**
- Line 13: Fix path from `/bubblemaps` to `/bubblemap`, update title/keywords to reflect the full capability set

**File 4: `src/components/chat/ChatWidget.tsx`**
- Line 17: Fix PRIORITY_PAGES entry from `/bubblemaps` to `/bubblemap`

### Bubblemap Knowledge Block (added to both AI prompts)

```text
## BUBBLEMAP INTELLIGENCE
The Bubblemap is NOT just a wallet visualization. It is a full Developer Reputation & Network Forensics tool:
- Maps a Developer's Wallet across ALL their token launches — showing track record (successful projects, rug pulls, slow drains)
- Cross-links the Dev Wallet to their social identity (X/Twitter handle, Telegram) via on-chain + social scraping
- Traces funding chains: Dev Wallet → funding wallets → KYC Root (the real person behind the money)
- Detects wallet bundles, sybil clusters, and circular funding patterns (bad actor signals)
- Scores developers as good actors (consistent, transparent) or bad actors (rug history, fake socials)
- Shows the X Community network: which Twitter accounts promote the token, who are admins/mods
- Pre-load any token: https://blackbox.farm/bubblemap?token=TOKEN_ADDRESS
When a user asks about a token's developer, team, or trustworthiness, the Bubblemap is the primary tool to recommend.
```

### Summary

- 8 URL fixes across 4 files (all `/bubblemaps` → `/bubblemap`)
- 1 knowledge block added to both web-chat and TG bot prompts
- 1 keyword/title update in sync-knowledge-base

