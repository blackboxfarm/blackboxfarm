## Diagnosis — yes, it's a real bug, not a UI glitch

The "Dev Wallet" column on `/super-admin` Master Token Directory shows things like `{"addr…ed"}` because the underlying row literally contains a **JSON object stringified into a TEXT column**.

Confirmed via DB:

```
pumpfun_watchlist.creator_wallet
  = '{"address":"65eY9uU5...","balance":33881204.27,"usdValue":3527.03,
      "percentageOfSupply":3.39,"confidence":45,
      "detectionMethod":"top_holder",
      "reason":"Top non-LP holder (3.4%) — creator unverified"}'
```

That's an entire `potentialDevWallet` payload shoved into a column that is supposed to hold a 32–44 char Solana address.

### Source of the corruption

`supabase/functions/holders-intel-poster/index.ts` has three sites where it falls back to the **whole object** instead of `.address`:

- Line 625: `const creatorWallet = report?.creatorInfo?.wallet || report?.potentialDevWallet;`
- Line 680: `(report?.creatorInfo?.wallet ?? report?.potentialDevWallet ?? null) as string | null;`
- Line 921: `const creatorWalletForMesh = report?.creatorInfo?.wallet || report?.potentialDevWallet || null;`

`bagless-holders-report` builds `potentialDevWallet` as `{ address, balance, percentageOfSupply, confidence, detectionMethod, reason, ... }`. The other consumers (`token-vigil`, `holdersintel-bot-webhook`) correctly use `potentialDevWallet?.address`. Only `holders-intel-poster` uses the bare object — and it's the one writing to `pumpfun_watchlist.creator_wallet`, which is exactly what the Master Token Directory view (`master_token_directory`) coalesces from first.

### Why the UI renders weirdly

`MasterDBTab.tsx` does `wallet.slice(0,6)…wallet.slice(-4)` — when `wallet` is the JSON blob string, `slice(0,6)` = `{"addr` and `slice(-4)` = `ed"}`, hence the `{"addr…ed"}` chip and the broken Solscan hover URL `solscan.io/account/{"address":"…","detectionMethod":"top_holder",…}`.

## Plan

### 1. Fix the writer (stop the bleed)

In `supabase/functions/holders-intel-poster/index.ts`, change all three fallbacks from `report?.potentialDevWallet` to `report?.potentialDevWallet?.address`. Add a defensive guard so only a string of length 32–44 (base58-shaped) is ever assigned to `creator_wallet`. Deploy.

### 2. Clean up corrupted rows

One-shot SQL migration to scrub `pumpfun_watchlist.creator_wallet` (and any other table that may have caught the same blob) where the value starts with `{`:

```sql
UPDATE pumpfun_watchlist
   SET creator_wallet = (creator_wallet::jsonb ->> 'address')
 WHERE creator_wallet LIKE '{%'
   AND creator_wallet ~ '^\{.*"address"';

UPDATE pumpfun_watchlist
   SET creator_wallet = NULL
 WHERE creator_wallet LIKE '{%';   -- safety: anything still malformed → null
```

Audit the same pattern in `scraped_tokens.creator_wallet`, `token_lifecycle.creator_wallet`, `funnel_feed_discoveries.creator_wallet`, and `developer_tokens.creator_wallet` (cheap `WHERE creator_wallet LIKE '{%'` check). Apply the same extract-or-null cleanup to anything that matches.

### 3. Add a permanent guard at the column level

Add a CHECK constraint to `pumpfun_watchlist` (and the four other tables above) so this can never silently re-occur:

```sql
ALTER TABLE pumpfun_watchlist
  ADD CONSTRAINT creator_wallet_is_address
  CHECK (creator_wallet IS NULL
      OR (length(creator_wallet) BETWEEN 32 AND 44
          AND creator_wallet !~ '[^1-9A-HJ-NP-Za-km-z]'));
```

This is base58 + correct-length, matching the same regex `validateTokenAddress` uses on the frontend. Any future buggy writer will fail loudly instead of poisoning the directory.

### 4. UI hardening (cheap belt-and-suspenders)

In `MasterDBTab.tsx` line 429, before slicing, validate the wallet shape; if it looks like JSON (starts with `{` or length > 44), render `—` instead of a broken link. This protects against any other source we haven't found yet.

### 5. Verify

After deploy + migration, re-query a sample (`BadAni`, `s0la`, `MOM`, etc.) and confirm `creator_wallet` is either a clean base58 string or null. Reload the Master Token Directory page and confirm Dev Wallet column shows real addresses or `—`, never `{"addr…ed"}`.

## Technical notes

- Migrations under `supabase/migrations/` are read-only; we'll add a new timestamped migration for the data backfill + CHECK constraints.
- `master_token_directory` is a view, not a table — no schema change needed there. Once base tables are clean, the view is automatically clean.
- Only `holders-intel-poster` needs to be redeployed; the other consumers were already correct.
- Root cause is a long-standing typo where the variable was renamed from a string to an object payload but one consumer was never updated.
