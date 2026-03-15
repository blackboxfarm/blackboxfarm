
DROP MATERIALIZED VIEW IF EXISTS master_token_directory;

CREATE MATERIALIZED VIEW master_token_directory AS
WITH community_links AS (
  SELECT 
    unnest(xc.linked_token_mints) AS token_mint,
    xc.community_id,
    xc.community_url,
    xc.name AS community_name,
    xc.admin_usernames,
    xc.moderator_usernames,
    xc.member_count
  FROM x_communities xc
  WHERE xc.linked_token_mints IS NOT NULL
    AND xc.is_deleted = false
),
community_agg AS (
  SELECT 
    cl.token_mint,
    array_agg(DISTINCT cl.community_url) FILTER (WHERE cl.community_url IS NOT NULL) AS x_community_urls,
    array_agg(DISTINCT cl.community_name) FILTER (WHERE cl.community_name IS NOT NULL) AS x_community_names,
    array_agg(DISTINCT admin_handle) FILTER (WHERE admin_handle IS NOT NULL) AS all_admin_handles,
    array_agg(DISTINCT mod_handle) FILTER (WHERE mod_handle IS NOT NULL) AS all_mod_handles,
    MAX(cl.member_count) AS max_community_members
  FROM community_links cl
  LEFT JOIN LATERAL unnest(cl.admin_usernames) AS admin_handle ON true
  LEFT JOIN LATERAL unnest(cl.moderator_usernames) AS mod_handle ON true
  GROUP BY cl.token_mint
),
mesh_devs AS (
  -- Mesh stores as wallet->token with 'created' or 'created_token'
  SELECT 
    rm.linked_id AS token_mint,
    array_agg(DISTINCT rm.source_id) FILTER (WHERE rm.source_id IS NOT NULL) AS dev_wallets
  FROM reputation_mesh rm
  WHERE rm.linked_type = 'token'
    AND rm.source_type = 'wallet'
    AND rm.relationship IN ('created', 'created_token', 'dev_wallet')
  GROUP BY rm.linked_id
),
mesh_websites AS (
  SELECT 
    rm.source_id AS token_mint,
    array_agg(DISTINCT rm.linked_id) FILTER (WHERE rm.linked_id IS NOT NULL) AS websites
  FROM reputation_mesh rm
  WHERE rm.source_type = 'token' AND rm.linked_type = 'website'
  GROUP BY rm.source_id
  UNION ALL
  SELECT 
    rm.linked_id AS token_mint,
    array_agg(DISTINCT rm.source_id) FILTER (WHERE rm.source_id IS NOT NULL) AS websites
  FROM reputation_mesh rm
  WHERE rm.linked_type = 'token' AND rm.source_type = 'website'
  GROUP BY rm.linked_id
),
mesh_websites_agg AS (
  SELECT token_mint, array_agg(DISTINCT w) AS websites
  FROM mesh_websites, unnest(websites) AS w
  GROUP BY token_mint
),
mesh_socials AS (
  SELECT 
    rm.source_id AS token_mint,
    array_agg(DISTINCT rm.linked_id) FILTER (WHERE rm.linked_id IS NOT NULL) AS x_handles
  FROM reputation_mesh rm
  WHERE rm.source_type = 'token' AND rm.linked_type = 'twitter'
  GROUP BY rm.source_id
  UNION ALL
  SELECT 
    rm.linked_id AS token_mint,
    array_agg(DISTINCT rm.source_id) FILTER (WHERE rm.source_id IS NOT NULL) AS x_handles
  FROM reputation_mesh rm
  WHERE rm.linked_type = 'token' AND rm.source_type = 'twitter'
  GROUP BY rm.linked_id
),
mesh_socials_agg AS (
  SELECT token_mint, array_agg(DISTINCT h) AS x_handles
  FROM mesh_socials, unnest(x_handles) AS h
  GROUP BY token_mint
)
SELECT
  st.token_mint,
  COALESCE(st.symbol, tl.symbol) AS symbol,
  COALESCE(st.name, tl.name) AS name,
  COALESCE(st.image_uri, tl.image_url) AS image_url,
  
  tl.launchpad,
  tl.market_cap,
  tl.price_usd,
  tl.liquidity_usd,
  tl.volume_24h,
  tl.current_status AS lifecycle_status,
  tl.pair_address,
  tl.dex_id,
  tl.oracle_score,
  
  st.first_seen_at,
  st.minted_at,
  st.bonded_at,
  st.times_seen,
  st.times_posted,
  st.was_posted,
  st.health_grade,
  
  COALESCE(md.dev_wallets, ARRAY[]::text[]) AS dev_wallets,
  
  COALESCE(ca.x_community_urls, ARRAY[]::text[]) AS x_community_urls,
  COALESCE(ca.x_community_names, ARRAY[]::text[]) AS x_community_names,
  COALESCE(ca.max_community_members, 0) AS community_member_count,
  COALESCE(ca.all_admin_handles, ARRAY[]::text[]) AS community_admin_handles,
  COALESCE(ca.all_mod_handles, ARRAY[]::text[]) AS community_mod_handles,
  COALESCE(msa.x_handles, ARRAY[]::text[]) AS mesh_x_handles,
  COALESCE(mwa.websites, ARRAY[]::text[]) AS websites

FROM holders_intel_seen_tokens st
LEFT JOIN token_lifecycle tl ON tl.token_mint = st.token_mint
LEFT JOIN community_agg ca ON ca.token_mint = st.token_mint
LEFT JOIN mesh_devs md ON md.token_mint = st.token_mint
LEFT JOIN mesh_websites_agg mwa ON mwa.token_mint = st.token_mint
LEFT JOIN mesh_socials_agg msa ON msa.token_mint = st.token_mint

WHERE st.was_posted = true

ORDER BY st.first_seen_at DESC;

CREATE UNIQUE INDEX idx_master_token_directory_mint ON master_token_directory (token_mint);
CREATE INDEX idx_master_token_directory_symbol ON master_token_directory (symbol);
