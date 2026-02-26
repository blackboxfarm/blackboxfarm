
# Oracle Cross-Reference Audit: Fix All Disconnected Data Paths

## Critical Issues Found

### 1. `developer-reputation` function is BLIND to 99% of the database
The `developer-reputation` edge function (used by FlipIt and other trading tools) ONLY queries `developer_profiles` -- a nearly empty table. It completely ignores:
- `dev_wallet_reputation` (16,000+ profiled wallets)
- `pumpfun_blacklist` (25+ blacklisted entities)
- `pumpfun_whitelist` (2+ whitelisted entities)
- `reputation_mesh` (55,000+ links)

**Result**: When Master Spider labels a wallet as BAD ACTOR, the trading system can't see it via this function.

### 2. `oracle-unified-lookup` (Intel Lookup) misses token-mint blacklist entries
When you submit a token mint, it resolves to a wallet, then only checks the blacklist by that wallet address. It never checks the original token mint against the blacklist. Master Spider blacklists tokens by their mint address -- but Intel Lookup won't find them because it only queries `identifier.eq.{resolvedWallet}`.

### 3. `oracle-unified-lookup` skips key tables for token resolution
It only tries `token_lifecycle` to resolve a token to a creator wallet. It skips:
- `pumpfun_watchlist` (1,900+ tokens tracked)
- `developer_tokens` (the main token-creator mapping table)

Master Spider and DevIntelReport both check these tables, but Intel Lookup doesn't.

### 4. `oracle-unified-lookup` can't parse X/Twitter URLs
Master Spider parses `https://x.com/handle` into `@handle`. Intel Lookup does NOT -- if you paste an X URL, it treats it as an unknown input type and fails.

### 5. CEX wallet detection uses fake/truncated prefixes
The `knownCEXes` array in Master Spider contains obviously truncated strings like `'5tzFkiKscjHsFKrxv2aNJchkHR'` and `'AC5RDfQFmDS1deWZos9'` that will never match real Binance/Coinbase hot wallets. These are placeholder strings.

### 6. Token upsert capped at 50 in unified lookup
`liveTokens.slice(0, 50)` in the auto-spider section means prolific devs with 200+ tokens lose 75% of their data.

## Fix Plan

### Fix 1: Rebuild `developer-reputation` to query ALL reputation tables
Make this function check `dev_wallet_reputation`, `pumpfun_blacklist`, `pumpfun_whitelist`, and `reputation_mesh` -- same tables that Master Spider and Intel Lookup use. Return a unified result that shows the complete picture.

### Fix 2: Add token-mint blacklist check in `oracle-unified-lookup`
When input is a token, also check the blacklist for the original token mint (not just the resolved wallet). Add an OR clause: `identifier.eq.{resolvedWallet},identifier.eq.{cleanedInput}`.

### Fix 3: Add `pumpfun_watchlist` and `developer_tokens` fallbacks for token resolution
In `oracle-unified-lookup`, add the same fallback chain that DevIntelReport uses: `token_lifecycle` -> `pumpfun_watchlist` -> `developer_tokens` -> pump.fun API.

### Fix 4: Add X URL parsing to `oracle-unified-lookup`
Port the `parseXUrl()` function from Master Spider into the unified lookup so X URLs are handled consistently.

### Fix 5: Replace fake CEX prefixes with real known addresses
Replace the truncated CEX strings with the actual known Binance and Coinbase hot wallet addresses used on Solana.

### Fix 6: Increase token upsert limit
Raise from 50 to 200 tokens in the auto-spider section of `oracle-unified-lookup`.

## Technical Details

**Files to modify:**
- `supabase/functions/developer-reputation/index.ts` -- Complete rewrite to query all reputation tables
- `supabase/functions/oracle-unified-lookup/index.ts` -- Fix token resolution, blacklist check, X URL parsing, token limit
- `supabase/functions/oracle-master-spider/index.ts` -- Fix CEX wallet addresses

**Database tables involved (all reads/writes unified):**
- `dev_wallet_reputation` -- Core wallet scoring (16k+ entries)
- `pumpfun_blacklist` -- Kill list (25+ entries)
- `pumpfun_whitelist` -- Trusted list (2+ entries)
- `reputation_mesh` -- Relationship graph (55k+ links)
- `developer_profiles` -- Legacy profiles
- `developer_tokens` -- Token-creator mappings
- `pumpfun_watchlist` -- Trending token tracker (1,900+ tokens)
- `token_lifecycle` -- Token status tracking

All three functions will be redeployed after changes.
