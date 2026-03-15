-- Backfill scraped_tokens with symbols from holders_intel_seen_tokens
INSERT INTO scraped_tokens (token_mint, symbol, name, discovery_source, first_seen_at)
SELECT DISTINCT ON (hs.token_mint)
  hs.token_mint,
  hs.symbol,
  hs.name,
  'backfill_from_seen_tokens',
  COALESCE(hs.first_seen_at, now())
FROM holders_intel_seen_tokens hs
WHERE hs.symbol IS NOT NULL 
  AND hs.symbol != 'UNKNOWN' 
  AND hs.symbol != ''
  AND hs.token_mint IN (
    SELECT DISTINCT unnest(linked_token_mints) FROM x_communities WHERE is_deleted = false AND linked_token_mints IS NOT NULL
  )
  AND NOT EXISTS (SELECT 1 FROM scraped_tokens st WHERE st.token_mint = hs.token_mint)
ORDER BY hs.token_mint, hs.first_seen_at DESC;

-- Backfill scraped_tokens with symbols from holders_intel_post_queue
INSERT INTO scraped_tokens (token_mint, symbol, name, discovery_source, first_seen_at)
SELECT DISTINCT ON (hq.token_mint)
  hq.token_mint,
  hq.symbol,
  hq.name,
  'backfill_from_post_queue',
  COALESCE(hq.created_at, now())
FROM holders_intel_post_queue hq
WHERE hq.symbol IS NOT NULL 
  AND hq.symbol != 'UNKNOWN' 
  AND hq.symbol != ''
  AND hq.token_mint IN (
    SELECT DISTINCT unnest(linked_token_mints) FROM x_communities WHERE is_deleted = false AND linked_token_mints IS NOT NULL
  )
  AND NOT EXISTS (SELECT 1 FROM scraped_tokens st WHERE st.token_mint = hq.token_mint)
ORDER BY hq.token_mint, hq.created_at DESC;

-- Backfill from token_lifecycle
INSERT INTO scraped_tokens (token_mint, symbol, name, discovery_source, first_seen_at)
SELECT DISTINCT ON (tl.token_mint)
  tl.token_mint,
  tl.symbol,
  tl.name,
  'backfill_from_lifecycle',
  now()
FROM token_lifecycle tl
WHERE tl.symbol IS NOT NULL 
  AND tl.symbol != 'UNKNOWN' 
  AND tl.symbol != ''
  AND tl.token_mint IN (
    SELECT DISTINCT unnest(linked_token_mints) FROM x_communities WHERE is_deleted = false AND linked_token_mints IS NOT NULL
  )
  AND NOT EXISTS (SELECT 1 FROM scraped_tokens st WHERE st.token_mint = tl.token_mint)
ORDER BY tl.token_mint;