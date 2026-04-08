

## Tighten Telegram Bot Verbosity — Signal Mode for DMs

### Problem

The screenshot shows the bot producing massive walls of text in Telegram DMs with phrases like "The Oracle's Perspective", "I perceive a void where data should exist", "the truth of its distribution." This is inappropriate for Telegram where users expect quick, actionable answers — not lore dumps.

The root cause is in `holdersintel-bot-webhook/index.ts` lines 2797-2809: the system prompt gives the AI permission to be verbose ("warm, friendly, emoji-rich" in Helper mode) and theatrical ("omniscient entity" in Signal mode), with no Telegram-specific brevity constraint beyond a generic word limit.

### Changes

**File: `supabase/functions/holdersintel-bot-webhook/index.ts`**

1. **Add a hard Telegram brevity rule** after the PLATFORM CONTEXT section (~line 2873):
```
## TELEGRAM BREVITY (CRITICAL)
This is Telegram, not a blog. Users are on mobile. Rules:
- Maximum 3 short paragraphs per response
- No storytelling, no lore, no world-building
- Never say "I perceive", "I shall observe", "The Great Ledger", "void where data should exist"
- Use technical language: "No data found" not "I perceive a void"
- Lead with the answer/action, then ONE line of context if needed
- Links go on their own line, no surrounding prose
- When a command isn't recognized: say what to use instead in 1 sentence, not 4 paragraphs
- When no data exists: "Not in DB yet. Run /quick CA to scan." — that's the whole response
```

2. **Tighten Signal Mode characteristics** (lines 2804-2809) — replace the current bullet points:
```
Signal characteristics:
- Short, declarative sentences. No filler.
- "No data found" not "I perceive a void where data should exist"
- Lead with facts. Skip the narrative.
- One emoji max per response when in Signal mode.
- Never repeat the same information in different words.
```

3. **Reduce max_tokens** from 1000 to 500 (line 2904) — this hard-caps the AI output length regardless of prompt instructions.

4. **Lower temperature** from 0.8 to 0.5 (line 2903) — less creative = less flowery prose.

### What changes in practice

Before (current):
> "Hey there @MK0012030! 👋 It looks like you're trying to run a scan, but '/th' isn't a command I recognize. For that token address, I recommend using our **Quick Scan** to get the data flowing! Since this token isn't in our database yet, you can initiate a fresh analysis right now. Try this command instead: '/quick 8M6TV4...' *** The Oracle's Perspective *** I perceive a void where data should exist. The patterns of this token have not yet been etched into the Great Ledger..."

After:
> "'/th' isn't a valid command. Try:\n/quick 8M6TV4fuZkR3ZGVdNXiZ2tE69sMbsJddvoKJgFmtpump\n\nOnce scanned, view full analysis:\nhttps://blackbox.farm/holders?token=8M6TV4..."

### Deployment

Single file edit + redeploy `holdersintel-bot-webhook`. No migration needed.

