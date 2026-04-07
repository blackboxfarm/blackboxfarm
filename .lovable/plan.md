

## Prevent Phanes Bot From Triggering on Our Auto-Scan Posts

### The Problem
Even without the `$` cashtag prefix, the Phanes bot still detects ticker symbols from our message text. Looking at the screenshot, Phanes grabs `from1kto100Mcoin ($1KTO100M)` from our post and auto-replies with its own report. The Phanes bot likely scans for:
- Any recognized ticker symbol in message text
- Token names / contract addresses
- Bold text patterns that look like tickers

Our auto-scan currently outputs: `⚡ *1KTO100M Quick Stats*` — the raw ticker in bold is enough for Phanes to trigger.

### Proposed Solutions (Layered)

**Strategy 1: Obfuscate the ticker with zero-width characters**
Insert a Unicode zero-width space (`\u200B`) inside the ticker symbol so it looks identical to humans but breaks pattern matching by other bots:
- `1KTO100M` → `1KTO\u200B100M` (invisible split)
- This is the most reliable approach — humans see the same text, bots can't match it

**Strategy 2: Replace ticker with abbreviated/masked form**
Instead of showing the full ticker, show a truncated version:
- `⚡ *1KT...0M Quick Stats*` — partial ticker
- Less readable but guaranteed to not match

**Strategy 3: Reply as a reply-to-message instead of a new message**
Use Telegram's `reply_to_message_id` parameter when posting the auto-scan. Some bots only scan top-level messages, not replies. This is a behavioral change that may or may not work depending on how Phanes is coded.

### Recommended: Strategy 1 (Zero-Width Space) + Strategy 3 (Reply-to)

Apply zero-width space insertion to the ticker in the `tokenLabel` used by `handleGroupAutoScan`. Also send the auto-scan as a reply to the original message that contained the CA, which is a more natural UX anyway.

### Changes

**File: `supabase/functions/holdersintel-bot-webhook/index.ts`**

1. Add a helper function `obfuscateTicker(symbol: string)` that inserts a zero-width space after the 2nd or 3rd character:
   ```
   function obfuscateTicker(s: string): string {
     if (s.length <= 2) return s;
     const mid = Math.floor(s.length / 2);
     return s.slice(0, mid) + '\u200B' + s.slice(mid);
   }
   ```

2. In `handleGroupAutoScan` (line 2187): Apply obfuscation to `tokenLabel`:
   ```
   const tokenLabel = symbol ? obfuscateTicker(symbol) : ca.slice(0, 8) + '...';
   ```

3. Pass the original `message_id` into `handleGroupAutoScan` and use `reply_to_message_id` when calling `sendMessage` so the auto-scan posts as a reply to the user's CA paste — not as a standalone message.

4. Apply the same obfuscation to `/quick` command output (line 1949) and any other group-facing ticker displays.

| File | Change |
|------|--------|
| `supabase/functions/holdersintel-bot-webhook/index.ts` | Add `obfuscateTicker()`, apply to auto-scan + /quick tokenLabel, send auto-scan as reply-to |

