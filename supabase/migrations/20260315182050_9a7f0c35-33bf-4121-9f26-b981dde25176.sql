
-- Master Token Database: one row per token with ALL related intel consolidated
CREATE MATERIALIZED VIEW IF NOT EXISTS master_token_directory AS
WITH community_links AS (
  -- Explode x_communities linked_token_mints into token_mint → community mapping
  SELECT 
    unnest(xc.linked_token_mints) AS token_mint,
    xc.community_id,
    xc.community_url,
    xc.name AS community_name,
    xc.admin_usernames,
    xc.moderator_usernames,
    xc.member_count,
    xc.is_deleted AS community_deleted,
    xc.description AS community_description
  FROM x_communities xc
  WHERE xc.linked_token_mints IS NOT NULL
    AND xc.is_deleted = false
),
community_agg AS (
  -- Aggregate per token: all communities, all admin/mod handles
  SELECT 
    cl.token_mint,
    array_agg(DISTINCT cl.community_url) FILTER (WHERE cl.community_url IS NOT NULL) AS x_community_urls,
    array_agg(DISTINCT cl.community_name) FILTER (WHERE cl.community_name IS NOT NULL) AS x_community_names,
    -- Flatten all admin usernames across all communities for this token
    array_agg(DISTINCT admin_handle) FILTER (WHERE admin_handle IS NOT NULL) AS all_admin_handles,
    -- Flatten all moderator usernames
    array_agg(DISTINCT mod_handle) FILTER (WHERE mod_handle IS NOT NULL) AS all_mod_handles,
    MAX(cl.member_count) AS max_community_members
  FROM community_links cl
  LEFT JOIN LATERAL unnest(cl.admin_usernames) AS admin_handle ON true
  LEFT JOIN LATERAL unnest(cl.moderator_usernames) AS mod_handle ON true
  GROUP BY cl.token_mint
),
mesh_devs AS (
  -- Get dev wallets from reputation_mesh (source_type='token', relationship='created_by' or 'dev_wallet')
  SELECT 
    rm.source_id AS token_mint,
    array_agg(DISTINCT rm.linked_id) FILTER (WHERE rm.linked_id IS NOT NULL) AS dev_wallets
  FROM reputation_mesh rm
  WHERE rm.source_type = 'token'
    AND rm.linked_type = 'wallet'
    AND rm.relationship IN ('created_by', 'dev_wallet', 'funded_by')
  GROUP BY rm.source_id
),
mesh_websites AS (
  -- Get websites from reputation_mesh
  SELECT 
    rm.source_id AS token_mint,
    array_agg(DISTINCT rm.linked_id) FILTER (WHERE rm.linked_id IS NOT NULL) AS websites
  FROM reputation_mesh rm
  WHERE rm.source_type = 'token'
    AND rm.linked_type = 'website'
  GROUP BY rm.source_id
),
mesh_socials AS (
  -- Get X handles linked to token via mesh
  SELECT 
    rm.source_id AS token_mint,
    array_agg(DISTINCT rm.linked_id) FILTER (WHERE rm.linked_id IS NOT NULL) AS x_handles
  FROM reputation_mesh rm
  WHERE rm.source_type = 'token'
    AND rm.linked_type = 'twitter'
  GROUP BY rm.source_id
)
SELECT
  -- Core token identity
  st.token_mint,
  COALESCE(st.symbol, tl.symbol) AS symbol,
  COALESCE(st.name, tl.name) AS name,
  COALESCE(st.image_uri, tl.image_url) AS image_url,
  
  -- Lifecycle / market data
  tl.creator_wallet AS lifecycle_dev_wallet,
  tl.launchpad,
  tl.market_cap,
  tl.price_usd,
  tl.liquidity_usd,
  tl.volume_24h,
  tl.current_status AS lifecycle_status,
  tl.pair_address,
  tl.dex_id,
  tl.oracle_score,
  
  -- Timing
  st.first_seen_at,
  st.minted_at,
  st.bonded_at,
  st.times_seen,
  st.times_posted,
  st.was_posted,
  st.health_grade,
  
  -- Dev wallets (from lifecycle + mesh)
  COALESCE(md.dev_wallets, ARRAY[]::text[]) || 
    CASE WHEN tl.creator_wallet IS NOT NULL THEN ARRAY[tl.creator_wallet] ELSE ARRAY[]::text[] END
    AS dev_wallets,
  
  -- X Communities
  COALESCE(ca.x_community_urls, ARRAY[]::text[]) AS x_community_urls,
  COALESCE(ca.x_community_names, ARRAY[]::text[]) AS x_community_names,
  COALESCE(ca.max_community_members, 0) AS community_member_count,
  
  -- X Handles (admins + mods from communities + mesh socials)
  COALESCE(ca.all_admin_handles, ARRAY[]::text[]) AS community_admin_handles,
  COALESCE(ca.all_mod_handles, ARRAY[]::text[]) AS community_mod_handles,
  COALESCE(ms.x_handles, ARRAY[]::text[]) AS mesh_x_handles,
  
  -- Websites
  COALESCE(mw.websites, ARRAY[]::text[]) AS websites

FROM holders_intel_seen_tokens st
LEFT JOIN token_lifecycle tl ON tl.token_mint = st.token_mint
LEFT JOIN community_agg ca ON ca.token_mint = st.token_mint
LEFT JOIN mesh_devs md ON md.token_mint = st.token_mint
LEFT JOIN mesh_websites mw ON mw.token_mint = st.token_mint
LEFT JOIN mesh_socials ms ON ms.token_mint = st.token_mint

WHERE st.was_posted = true

ORDER BY st.first_seen_at DESC;

-- Index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_master_token_directory_mint ON master_token_directory (token_mint);
CREATE INDEX IF NOT EXISTS idx_master_token_directory_symbol ON master_token_directory (symbol);

-- Refresh function
CREATE OR REPLACE FUNCTION public.refresh_master_token_directory()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY master_token_directory;
END;
$$;
