

## Context-Aware AI Assistant with User Memory & Database Lookups

### What This Builds

Transforms both the **web-chat** and **TG bot AI chat** from stateless Q&A into a context-aware assistant that:
1. **Remembers users** across sessions with a persistent memory/preferences table
2. **Cross-references identity** — knows if a web user is also registered on Telegram (and vice versa)
3. **Looks up real data** when users submit token addresses, Twitter handles, or ask about their account status
4. **Asks "What should I call you?"** on first interaction and remembers the answer

### Architecture

```text
User message arrives (web or TG)
       │
       ▼
┌──────────────────────────┐
│  Identify User           │
│  - Web: auth userId      │
│  - TG: telegram_user_id  │
│  - Anon: session_id      │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  Load User Context       │
│  (new table:             │
│   ai_user_memory)        │
│  + profiles              │
│  + telegram_link_codes   │
│  + email_verifications   │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  Detect Intent           │
│  (regex patterns)        │
│  - Solana CA? → lookup   │
│  - Twitter @handle?      │
│  - "email" question?     │
│  - "bubblemaps"?         │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  Query Database          │
│  (token_lifecycle,       │
│   token_social_links,    │
│   reputation_mesh,       │
│   email_verifications,   │
│   etc.)                  │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│  Inject into system      │
│  prompt as ## USER       │
│  PROFILE + ## LIVE DATA  │
│  blocks                  │
└──────────┬───────────────┘
           ▼
        AI Response
```

### 1. New Table: `ai_user_memory`

Persistent per-user memory the AI reads/writes:

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `user_id` | uuid (nullable) | Web account ref |
| `telegram_user_id` | text (nullable) | TG identity |
| `session_id` | text (nullable) | For anon visitors |
| `preferred_name` | text | "What should I call you?" |
| `language_preference` | text | Detected/stated language |
| `interests` | text[] | Topics they ask about |
| `notes` | jsonb | Freeform AI memory |
| `created_at` / `updated_at` | timestamptz | |

Unique constraint on `(user_id)` and `(telegram_user_id)` where not null.

### 2. User Context Loader (shared function)

A `buildUserContext()` function used by both `web-chat` and `handleAiFreeChat` that:

- Loads `ai_user_memory` for the user
- If `user_id` exists: loads `profiles` (display_name, email_verified, tier, referral_source)
- Cross-references `telegram_link_codes` to find their TG identity (or web identity from TG)
- Checks `email_verifications` for verification status, sent/opened/clicked timestamps
- Returns a structured context block injected into the system prompt

### 3. Intent Detection & Live Data Lookups

Before calling the AI, scan the user's message for actionable patterns:

| Pattern | Action | Data Source |
|---------|--------|-------------|
| Solana address (base58, 32-44 chars) | Lookup token info | `token_lifecycle` + `token_social_links` + `reputation_mesh` |
| `@handle` or Twitter URL | Find linked tokens | `token_social_links` where `platform='twitter'` |
| "email" / "verify" / "verification" | Check their email status | `email_verifications` + `email_tracking_events` |
| "bubblemaps" / "bubble map" | Provide link + explain | Knowledge bins + direct URL |
| "dev wallet" / "KYC" / "funding" | Lookup genealogy | `reputation_mesh` for the token/wallet |
| "subscribe" / "upgrade" / "pro" | Check their current tier + link | `profiles.cached_tier_key` |

Results are injected as a `## LIVE DATA LOOKUP` block in the system prompt so the AI can reference real facts.

### 4. System Prompt Additions

Both web-chat and TG bot get these new prompt sections:

```
## USER PROFILE
- Name: Pablo (they prefer this)
- Platform: Website (also registered on Telegram as @pablo_crypto)
- Account tier: Free
- Email: verified ✅ (verified 3 days ago)
- Member since: March 2026
- Interests: holders analysis, dev wallets

## LIVE DATA LOOKUP
User submitted: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
- Token: BONK ($BONK)
- Phase: Established (bonded 45 days ago)
- Top 10 holders: 34.2%
- Dev wallet: 5abc...def → funded by Binance (KYC confirmed)
- Social links: twitter.com/bonaboracoin, t.me/bonkcommunity

## INSTRUCTIONS
- Address the user as "Pablo"
- Reference the live data naturally in your response
- If they ask follow-up questions about this token, you have the data above
```

### 5. "What should I call you?" Flow

- On first interaction (no `ai_user_memory` record), the AI's prompt includes: "This is a new user. In your first reply, warmly introduce yourself and ask what they'd like to be called."
- When the user responds with a name, the AI includes it in the reply — and the edge function parses the conversation to extract it and save to `ai_user_memory.preferred_name`
- Subsequent sessions: greeting uses their name automatically

### 6. Cross-Platform Identity

When a web user has a linked Telegram account (via `telegram_link_codes`):
- The AI knows their TG username and can reference it
- If they mention a TG problem, the AI can check `telegram_group_messages` for recent DM history
- If a TG user mentions their web account, the AI can look up their profile

### Files to Create/Change

| File | Change |
|------|--------|
| Migration | Create `ai_user_memory` table |
| `supabase/functions/web-chat/index.ts` | Add user context loader, intent detection, live data lookups |
| `supabase/functions/holdersintel-bot-webhook/index.ts` | Same context loader in `handleAiFreeChat`, share the same memory table |

### What This Does NOT Do (Future Phase)

- Does not give the AI write access to modify user accounts
- Does not auto-submit tokens for scanning (just looks up existing data)
- Does not create a separate admin dashboard for memory management (uses existing AI Config)
- Bubblemaps/KYC visualization stays on the website — AI provides links

### Rate Limiting & Safety

- Database lookups are capped at 1 per message (only the first detected pattern triggers a lookup)
- Memory writes are append-only and limited to preferences (name, language, interests)
- All guardrails still apply — the AI cannot share other users' data, only the requesting user's own info

