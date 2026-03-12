

## Plan: Telegram Group Recycling Detection via Immutable Channel ID

### The Insight
Developers recycle Telegram groups by simply renaming them (`t.me/guanocoin` → `t.me/newcoin`). Currently the mesh only stores the mutable username, so recycled groups look like separate entities. By resolving usernames to their immutable numeric channel IDs, recycled groups automatically link all tokens that ever used them.

### What Changes

**1. Extend `social-mesh-linker` to resolve Telegram numeric IDs**
- After extracting the username from `t.me/xxxxx`, call Bot API `getChat?chat_id=@xxxxx` to get the numeric ID
- Store the numeric ID as the primary `source_id` (e.g., `source_type: "telegram_channel"`, `source_id: "-1001234567890"`)
- Keep the username as a secondary mesh link (`telegram_username → telegram_channel`) so both are searchable
- Store the resolved title and username history in `evidence`
- If Bot API call fails (bot not in group, private group), fall back to current username-only behavior

**2. Add a `telegram_channel_registry` table**
```
telegram_channel_registry:
  - channel_id (bigint, PK) — immutable numeric ID
  - current_username (text, nullable) — last known @username
  - current_title (text) — last known display name
  - username_history (jsonb[]) — [{username, first_seen, last_seen}]
  - title_history (jsonb[]) — [{title, first_seen, last_seen}]
  - linked_token_count (int) — how many tokens have used this group
  - first_seen_at, last_seen_at (timestamps)
```

**3. Create mesh links using the numeric ID**
- `telegram_channel:-1001234567890` → `wallet:ABC` (social_account_of, from $LOBSTAR)
- `telegram_channel:-1001234567890` → `wallet:DEF` (social_account_of, from $DISTORTED)
- `telegram_channel:-1001234567890` → `wallet:GHI` (social_account_of, from $GUANOCOIN)

All three wallets now visibly connect through the same immutable node in the Bubble Map, regardless of what the group was called at the time.

**4. Bubble Map label for Telegram nodes**
- Show the current group title (e.g., "Guano Coin Community") instead of the username
- If recycled (linked_token_count > 1), show a warning badge: "♻️ Recycled Group (3 tokens)"

**5. Backfill existing Telegram links**
- One-time scan of existing `reputation_mesh` rows where `source_type = "telegram"` 
- Resolve each username → numeric ID and migrate to new format
- Creates instant connections for already-indexed tokens

### Files to create/change
- **Create**: `supabase/functions/_shared/telegram-resolver.ts` — shared utility calling Bot API `getChat`
- **Create**: migration for `telegram_channel_registry` table
- **Edit**: `supabase/functions/social-mesh-linker/index.ts` — use resolver before inserting mesh links
- **Edit**: `src/hooks/useMeshGraph.ts` — label enrichment for `telegram_channel` nodes
- **Edit**: `src/components/admin/oracle/MeshGraphVisualizer.tsx` — recycled group badge/color

### Performance impact
- Adds 1 Bot API call per unique Telegram URL per token (rate limit: 30 calls/sec, well within BATCH_SIZE of 20)
- Resolution is cached in `telegram_channel_registry` so repeated usernames skip the API call

