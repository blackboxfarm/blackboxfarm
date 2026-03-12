

## Plan: X Account ID Resolution & Handle History Tracking

### The Problem
Currently, X handles are stored as mutable strings (`source_type: "x_account"`, `source_id: "somehandle"`). When a scammer changes `@rugdev` → `@legitproject`, the mesh treats them as two separate entities. This is the exact same vulnerability we just solved for Telegram groups.

### Can We Query Phanes Bot?
No. Phanes Crypto Bot has no public API. It's a closed Telegram bot with no documented query endpoints. We build this independently.

### How X Handle Resolution Works
The X API v2 endpoint `GET /2/users/by/username/:username` returns an **immutable numeric user ID** for any handle. This ID never changes regardless of how many times the account renames itself. This is our anchor — identical pattern to Telegram's `getChat` returning channel IDs.

### What Changes

**1. Create `supabase/functions/_shared/x-handle-resolver.ts`**
Mirror of `telegram-resolver.ts`:
- Takes a handle string, calls X API v2 `GET /2/users/by/username/:handle`
- Returns `{ userId, displayName, handle, isRotated, handleCount }`
- Caches in `x_account_registry` table
- Tracks handle history: if numeric ID already exists under a different handle, records the old handle with timestamps
- Falls back to handle-only if API fails (rate limit, suspended account, etc.)

**2. Create `x_account_registry` table (migration)**
```
x_account_registry:
  - x_user_id (text, PK) — immutable numeric ID (e.g., "1234567890")
  - current_handle (text) — last known @handle
  - display_name (text) — last known display name
  - is_verified (boolean) — blue check status
  - handle_history (jsonb[]) — [{handle, first_seen, last_seen}]
  - name_history (jsonb[]) — [{name, first_seen, last_seen}]
  - linked_token_count (int) — how many tokens this account has been linked to
  - first_seen_at, last_seen_at (timestamps)
```

**3. Update `social-mesh-linker` to resolve X handles**
After extracting a Twitter handle from `twitter_url`:
- Call `resolveXHandle(handle, supabase)` → get numeric ID
- Primary mesh link: `x_user:1234567890` → `wallet:ABC` (immutable)
- Secondary link: `x_account:handle` → `x_user:1234567890` (searchable alias)
- If resolution fails, fall back to current `x_account:handle` → `wallet` behavior

**4. Update Bubble Map labels for `x_user` nodes**
- Show `@currenthandle` as label (fetched from registry)
- If `handle_history` has entries, show rotation badge: `🔄 @current (3 prev handles)`
- Tooltip or click detail shows previous handles

**5. X API Access**
The X API v2 Basic tier ($200/mo) allows 10,000 user lookups per month. We need the `TWITTER_BEARER_TOKEN` secret. Resolution is cached so each unique handle only costs 1 API call ever — subsequent encounters use the registry.

### Files to Create/Change
- **Create**: `supabase/functions/_shared/x-handle-resolver.ts`
- **Create**: Migration for `x_account_registry` table
- **Edit**: `supabase/functions/social-mesh-linker/index.ts` — use X resolver before mesh inserts
- **Edit**: `src/hooks/useMeshGraph.ts` — label enrichment for `x_user` nodes with rotation badge
- **Edit**: `src/components/admin/oracle/MeshGraphVisualizer.tsx` — color/icon for `x_user` type

### Performance
- 1 X API call per unique handle (cached forever in registry)
- Same BATCH_SIZE=20 flow as existing mesh linker
- No impact on existing mesh queries — adds new node type alongside existing ones

