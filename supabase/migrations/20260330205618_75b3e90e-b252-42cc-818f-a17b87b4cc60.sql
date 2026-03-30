-- Create a curated live feed view that blends multiple token sources
-- Priority: Top 200 > recently posted > recently discovered
-- Deduplicates by token_mint, picks best available data

CREATE OR REPLACE VIEW public.live_feed_curated AS
WITH ranked_posts AS (
  -- Most recent post per token from the intel queue
  SELECT DISTINCT ON (token_mint)
    token_mint,
    symbol,
    name,
    posted_at,
    tweet_id,
    trigger_source,
    created_at
  FROM holders_intel_post_queue
  WHERE status = 'posted' AND posted_at IS NOT NULL
  ORDER BY token_mint, posted_at DESC
),
top200 AS (
  -- Current top 200 tokens from lifecycle
  SELECT
    token_mint,
    symbol,
    name,
    last_top_200_rank,
    image_url,
    last_seen_at,
    market_cap
  FROM token_lifecycle
  WHERE is_currently_top_200 = true
),
combined AS (
  -- Union: top200 tokens + posted tokens (deduped, top200 wins on freshness)
  SELECT
    COALESCE(t.token_mint, p.token_mint) AS token_mint,
    COALESCE(t.symbol, p.symbol) AS symbol,
    COALESCE(t.name, p.name) AS name,
    p.posted_at,
    p.tweet_id,
    p.trigger_source,
    t.last_top_200_rank,
    t.image_url AS lifecycle_image,
    CASE
      WHEN t.token_mint IS NOT NULL AND t.last_top_200_rank IS NOT NULL THEN 1  -- Top 200
      WHEN p.posted_at > now() - interval '24 hours' THEN 2  -- Recent posts
      WHEN p.posted_at > now() - interval '3 days' THEN 3
      WHEN p.posted_at > now() - interval '7 days' THEN 4
      ELSE 5
    END AS freshness_tier,
    COALESCE(t.last_seen_at, p.posted_at, p.created_at) AS last_activity
  FROM ranked_posts p
  FULL OUTER JOIN top200 t ON t.token_mint = p.token_mint
)
SELECT
  c.token_mint,
  c.symbol,
  c.name,
  c.posted_at,
  c.tweet_id,
  c.trigger_source,
  c.last_top_200_rank,
  c.freshness_tier,
  c.last_activity,
  s.health_grade,
  COALESCE(s.image_uri, c.lifecycle_image) AS image_uri,
  s.banner_url
FROM combined c
LEFT JOIN holders_intel_seen_tokens s ON s.token_mint = c.token_mint
ORDER BY c.freshness_tier ASC, c.last_activity DESC NULLS LAST;

-- Allow public read
GRANT SELECT ON public.live_feed_curated TO anon, authenticated;

COMMENT ON VIEW public.live_feed_curated IS 'Curated live feed blending Top 200, posted intel, and recent discoveries. Ranked by freshness tier.';