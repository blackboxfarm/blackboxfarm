

## Audit Results + DM Analysis + Avatar Fix

### 1. Critical Bug Found: Web Chat is BROKEN

The error in your screenshot ("Failed to connect") is a **deploy-crashing syntax error**:

```
Uncaught SyntaxError: Identifier 'lastUserMsg' has already been declared
at web-chat/index.ts:421:11
```

**Root cause**: `const lastUserMsg` is declared on **line 450** (for sanitization) and again on **line 479** (for intent detection). This is a `const` redeclaration which crashes the entire edge function on boot. No web chat works at all right now.

**Fix**: Rename the second declaration on line 479 to reuse the existing variable — just remove the `const` keyword since it's already in scope.

### 2. DM Analysis — Common Misconceptions & Misused Commands

From analyzing all private DM interactions:

| Pattern | Count | What's Happening |
|---------|-------|-------------------|
| `/pnl CA` | 15 | Most popular command, working correctly |
| `/th CA` | 15 | Tied most popular, working correctly |
| `/bundle CA` | 6 | Working correctly |
| `/top10@null` | 1 | User typed `/top10@null` — bot menu appending `@null` instead of bot username |
| `/emojis@null` | 1 | Same `@null` issue — these are likely non-existent commands |
| `/lb` | 1 | User (xxDON) trying a "leaderboard" command that doesn't exist |
| `/calls` | 1 | User (xxDON) trying a "calls" command that doesn't exist |
| `/tw CA` | 1 | User trying `/tw` instead of `/twitter` — not a recognized shortcut |
| `/FRH...pump` | 1 | User pasted CA with `/` prefix — confused about syntax |
| Raw CA paste | 2+ | Users paste CAs without any command, expecting auto-scan (which only works in groups) |

**Key findings**:
- Users xxDON and the anonymous user are trying commands that don't exist (`/lb`, `/calls`, `/emojis`, `/top10`)
- The `@null` suffix suggests a broken bot menu configuration in BotFather (commands registered with no username)
- Users expect DM auto-scan (paste a CA, get a report) but this only works in groups
- The AI chat is hallucinating commands like `/insiders` in its promotional responses to users who can't use them (free tier)

**Recommendations to implement**:
- Add a "did you mean?" fallback for unrecognized DM commands (e.g., `/lb` → "Did you mean /leaderboard? That's not available yet, but try /th or /pnl!")
- Enable DM auto-scan: when a user pastes a raw CA in DM without a command, auto-run `/th` on it
- Fix the AI's promotional text to only mention commands the user's tier can access

### 3. Avatar: Replace Chat Bubble Icon with Cosmic Entity

Replace the `MessageCircle` icon in both the FAB button and the chat header with the uploaded cosmic entity image (aura2.png), displayed in a circular mask.

**Changes**:
- Copy `aura2.png` to `src/assets/oracle-avatar.png`
- FAB: Replace `<MessageCircle>` with `<img>` inside a `rounded-full overflow-hidden` container
- Chat header: Replace the `MessageCircle` icon avatar with the same image
- Welcome empty state: Replace the large `MessageCircle` with the avatar image

### Files to Change

| File | Change |
|------|--------|
| `supabase/functions/web-chat/index.ts` | Fix `lastUserMsg` duplicate declaration (line 479 → remove `const`) |
| `src/assets/oracle-avatar.png` | Copy uploaded aura2.png |
| `src/components/chat/ChatWidget.tsx` | Replace all `MessageCircle` icons with circular oracle avatar image |
| `supabase/functions/holdersintel-bot-webhook/index.ts` | Add DM auto-scan for raw CA pastes + "did you mean?" for unknown commands |

