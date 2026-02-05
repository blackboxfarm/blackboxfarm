
## Token-Specific Banner System via UTM

### Overview
When a user lands on `/holders?token=XXX&utm_community=YYY`, we check a new **token_banners** database table for that token's Dexscreener banner. If found, Banner #1 shows that specific banner instead of the random/scheduled rotation.

### Database Schema

**New Table: `token_banners`**
```text
┌─────────────────────────────────────────────────────────────┐
│ token_banners                                               │
├─────────────────────────────────────────────────────────────┤
│ id              UUID (PK)                                   │
│ token_address   TEXT (unique, indexed)                      │
│ symbol          TEXT                                        │
│ banner_url      TEXT (Dexscreener header URL)               │
│ link_url        TEXT (e.g., dexscreener.com/solana/TOKEN)   │
│ x_community_id  TEXT (optional - X community number)        │
│ notes           TEXT                                        │
│ is_active       BOOLEAN (default true)                      │
│ created_at      TIMESTAMPTZ                                 │
│ updated_at      TIMESTAMPTZ                                 │
└─────────────────────────────────────────────────────────────┘
```

### Flow

```text
User clicks UTM link from X Community
        ↓
/holders?token=ABC&utm_community=123
        ↓
usePageTracking captures UTM params (already works)
        ↓
AdBanner component passes token param to edge function
        ↓
get-banner-for-position checks token_banners table
        ↓
If token found → return that banner for position 1
If not found → normal rotation/Dexscreener fallback
```

### Code Changes

**1. Create `token_banners` table**
- Migration SQL with RLS (super_admin can manage)

**2. Update `AdBanner.tsx`**
- Read `token` from URL params
- Pass `tokenAddress` to `get-banner-for-position`

**3. Update `get-banner-for-position/index.ts`**
- Accept optional `tokenAddress` param
- If provided, check `token_banners` table first
- If match found, return that banner (highest priority)
- If no match, fall through to existing logic

**4. Admin UI for managing token_banners**
- Add to SuperAdmin dashboard
- Fields: token address, symbol, banner URL, link URL, X community ID

### Technical Details

**AdBanner change:**
```typescript
const urlParams = new URLSearchParams(window.location.search);
const tokenAddress = urlParams.get('token');

// Pass to edge function
const { data } = await supabase.functions.invoke('get-banner-for-position', {
  body: { position, tokenAddress }
});
```

**Edge function priority:**
1. Token-specific banner (if `tokenAddress` provided and found in `token_banners`)
2. Scheduled/paid banners
3. Default banners
4. Dexscreener fallback

### UTM Format
```
blackbox.farm/holders?token=ABC123&utm_source=x&utm_community=solana-degens
```
- `token` = the token address for report
- `utm_community` = X community identifier (tracked in page_visits)
