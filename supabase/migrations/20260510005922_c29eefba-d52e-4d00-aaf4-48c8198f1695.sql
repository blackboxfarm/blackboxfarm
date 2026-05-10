-- Clean up creator_wallet columns that contain JSON blobs (e.g.
-- '{"address":"...","detectionMethod":"top_holder",...}') instead of plain
-- base58 wallet addresses. Root cause was a stale fallback in
-- holders-intel-poster that wrote `report.potentialDevWallet` (the whole
-- object) instead of `report.potentialDevWallet.address`.

-- 1. Extract the address out of any JSON-shaped value.
UPDATE public.pumpfun_watchlist
   SET creator_wallet = (creator_wallet::jsonb ->> 'address')
 WHERE creator_wallet LIKE '{%'
   AND creator_wallet ~ '^\s*\{.*"address"\s*:';

-- 2. Null-out anything still malformed (defensive).
UPDATE public.pumpfun_watchlist
   SET creator_wallet = NULL
 WHERE creator_wallet IS NOT NULL
   AND (
        creator_wallet LIKE '{%'
     OR length(creator_wallet) NOT BETWEEN 32 AND 44
     OR creator_wallet ~ '[^1-9A-HJ-NP-Za-km-z]'
   );

-- 3. Permanent guard: only base58, length 32-44, or NULL.
ALTER TABLE public.pumpfun_watchlist
  ADD CONSTRAINT pumpfun_watchlist_creator_wallet_is_address
  CHECK (
    creator_wallet IS NULL
 OR (length(creator_wallet) BETWEEN 32 AND 44
     AND creator_wallet ~ '^[1-9A-HJ-NP-Za-km-z]+$')
  );