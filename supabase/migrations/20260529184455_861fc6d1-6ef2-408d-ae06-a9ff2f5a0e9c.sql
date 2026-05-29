
-- Drop the legacy 3-arg lock_entry_mcap overload that has NO discovery-window guard.
-- Only the 4-arg version (with p_source) remains; it routes through upsert_mesh_entry_mcap
-- which enforces the 30-minute window + authorized-source rules.
DROP FUNCTION IF EXISTS public.lock_entry_mcap(text, numeric, text);

-- Correct $CUM entry-MC corruption: canonical Insiders Entry MC was $43.2k.
-- Mesh row + lifecycle were both clobbered to $630k by an un-guarded ratchet.
UPDATE public.holders_intel_seen_tokens
   SET entry_mcap_usd = 43200,
       market_cap_at_discovery = LEAST(COALESCE(market_cap_at_discovery, 43200), 43200)
 WHERE token_mint = 'oqU4DdYCbdSf9j74vnEgvCn1YzNfYQEPWaC6pu6pump';

UPDATE public.telegram_insider_token_lifecycle
   SET entry_market_cap = 43200
 WHERE token_mint = 'oqU4DdYCbdSf9j74vnEgvCn1YzNfYQEPWaC6pu6pump';
