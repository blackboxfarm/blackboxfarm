
-- Step 1: Clear stale top-200 flags (tokens not seen in 48 hours)
UPDATE token_lifecycle
SET is_currently_top_200 = false
WHERE is_currently_top_200 = true
  AND last_seen_at < now() - interval '48 hours';

-- Step 2: Recreate the live feed view with age cutoff and better ranking
CREATE OR REPLACE VIEW public.live_feed_curated AS
WITH ranked_posts AS (
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
    AND posted_at > now() - interval '14 days'
  ORDER BY token_mint, posted_at DESC
),
top200 AS (
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
    AND last_seen_at > now() - interval '48 hours'
),
combined AS (
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
      WHEN t.token_mint IS NOT NULL AND t.last_top_200_rank IS NOT NULL THEN 1
      WHEN p.posted_at > now() - interval '24 hours' THEN 2
      WHEN p.posted_at > now() - interval '3 days' THEN 3
      ELSE 4
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

GRANT SELECT ON public.live_feed_curated TO anon, authenticated;
