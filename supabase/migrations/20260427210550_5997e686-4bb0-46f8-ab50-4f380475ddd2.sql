-- 1. Drop website-scraped social ownership links — these were creating false
--    "this dev is the github user X" links from open-source contributor pages.
DELETE FROM public.reputation_mesh
WHERE relationship = 'social_account_of'
  AND discovered_via = 'social-mesh-linker'
  AND evidence->>'source' = 'website_scrape'
  AND confidence <= 60;

-- 2. Drop everything anchored on the Axiom.trade router wallet — it's a
--    public swap aggregator, never a real "shared funder".
DELETE FROM public.reputation_mesh
WHERE source_id = 'AxiomRXZAq1Jgjj9pHmNqVP7Lhu67wLXZJZbaK87TTSk'
   OR linked_id = 'AxiomRXZAq1Jgjj9pHmNqVP7Lhu67wLXZJZbaK87TTSk';

-- 3. Backfill the active $HENRY row's creator_wallet (it was NULL because
--    token_lifecycle wasn't being updated by the resolver until now).
UPDATE public.token_lifecycle
SET creator_wallet = '7L3pwHJLSep5n2MmfKty4aWjBjqivpGVoRY2HNXMGnaw'
WHERE token_mint = 'CJUrENDAuSm4FxxziUgftnUJqqXjm4VL1zhJgwXupump'
  AND creator_wallet IS NULL;