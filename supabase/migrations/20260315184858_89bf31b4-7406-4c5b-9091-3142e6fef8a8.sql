
-- Drop existing view and recreate with all requested changes
DROP MATERIALIZED VIEW IF EXISTS master_token_directory;

CREATE MATERIALIZED VIEW master_token_directory AS
WITH all_mints AS (
  SELECT DISTINCT u.token_mint
  FROM (
    SELECT token_mint FROM holders_intel_seen_tokens
    UNION
    SELECT token_mint FROM scraped_tokens
    UNION
    SELECT token_mint FROM token_lifecycle
    UNION
    SELECT token_mint FROM pumpfun_watchlist
    UNION
    SELECT linked_id AS token_mint FROM reputation_mesh WHERE linked_type = 'token'
  ) u
  WHERE u.token_mint IS NOT NULL AND length(u.token_mint) >= 32
),

-- Community data with admin/mod X handles
community_links AS (
  SELECT 
    unnest(xc.linked_token_mints) AS token_mint,
    xc.community_url,
    xc.name AS community_name,
    xc.admin_usernames,
    xc.moderator_usernames
  FROM x_communities xc
  WHERE xc.linked_token_mints IS NOT NULL AND xc.is_deleted = false
),
community_agg AS (
  SELECT 
    cl.token_mint,
    array_agg(DISTINCT cl.community_url) FILTER (WHERE cl.community_url IS NOT NULL) AS x_community_urls,
    array_agg(DISTINCT cl.community_name) FILTER (WHERE cl.community_name IS NOT NULL) AS x_community_names,
    array_agg(DISTINCT a.a) FILTER (WHERE a.a IS NOT NULL) AS community_admin_handles,
    array_agg(DISTINCT m.m) FILTER (WHERE m.m IS NOT NULL) AS community_mod_handles
  FROM community_links cl
  LEFT JOIN LATERAL unnest(cl.admin_usernames) a(a) ON true
  LEFT JOIN LATERAL unnest(cl.moderator_usernames) m(m) ON true
  GROUP BY cl.token_mint
),

-- Mesh: dev wallets linked to tokens
mesh_devs AS (
  SELECT 
    rm.linked_id AS token_mint,
    array_agg(DISTINCT rm.source_id) AS dev_wallets
  FROM reputation_mesh rm
  WHERE rm.linked_type = 'token' 
    AND rm.source_type = 'wallet' 
    AND rm.relationship IN ('created', 'created_token', 'dev_wallet')
  GROUP BY rm.linked_id
),

-- Mesh: websites
mesh_websites AS (
  SELECT w.token_mint, array_agg(DISTINCT w.site) AS websites
  FROM (
    SELECT rm.source_id AS token_mint, rm.linked_id AS site
    FROM reputation_mesh rm WHERE rm.source_type = 'token' AND rm.linked_type = 'website'
    UNION ALL
    SELECT rm.linked_id AS token_mint, rm.source_id AS site
    FROM reputation_mesh rm WHERE rm.linked_type = 'token' AND rm.source_type = 'website'
  ) w
  GROUP BY w.token_mint
),

-- Mesh: X handles
mesh_x AS (
  SELECT x.token_mint, array_agg(DISTINCT x.handle) AS x_handles
  FROM (
    SELECT rm.source_id AS token_mint, rm.linked_id AS handle
    FROM reputation_mesh rm WHERE rm.source_type = 'token' AND rm.linked_type = 'twitter'
    UNION ALL
    SELECT rm.linked_id AS token_mint, rm.source_id AS handle
    FROM reputation_mesh rm WHERE rm.linked_type = 'token' AND rm.source_type = 'twitter'
  ) x
  GROUP BY x.token_mint
),

-- Dev reputation from mesh + dev_wallet_reputation
dev_rep AS (
  SELECT 
    md.token_mint,
    (array_agg(dwr.wallet_address ORDER BY dwr.reputation_score DESC NULLS LAST))[1] AS primary_dev_wallet,
    max(dwr.reputation_score) AS dev_reputation_score,
    (array_agg(dwr.trust_level ORDER BY dwr.reputation_score DESC NULLS LAST))[1] AS dev_trust_level,
    (array_agg(dwr.dev_pattern ORDER BY dwr.reputation_score DESC NULLS LAST))[1] AS dev_pattern,
    max(dwr.total_tokens_launched) AS dev_total_launches,
    max(dwr.tokens_rugged) AS dev_tokens_rugged,
    max(dwr.tokens_successful) AS dev_tokens_successful,
    bool_or(dwr.auto_blacklisted) AS dev_auto_blacklisted,
    bool_or(dwr.is_serial_spammer) AS dev_is_serial_spammer,
    bool_or(dwr.is_legitimate_builder) AS dev_is_legitimate_builder
  FROM mesh_devs md
  JOIN LATERAL unnest(md.dev_wallets) dw(dw) ON true
  LEFT JOIN dev_wallet_reputation dwr ON dwr.wallet_address = dw.dw
  GROUP BY md.token_mint
),

-- KYC from developer_profiles via creator wallet
kyc_data AS (
  SELECT DISTINCT ON (dp.master_wallet_address)
    dp.master_wallet_address,
    dp.kyc_verified,
    dp.kyc_source
  FROM developer_profiles dp
  WHERE dp.kyc_verified = true
)

SELECT
  am.token_mint,
  
  -- IDENTITY: symbol ($TICKER), name, image
  COALESCE(hist.symbol, tl.symbol, sc.symbol, pw.token_symbol) AS symbol,
  COALESCE(hist.name, tl.name, sc.name, pw.token_name) AS name,
  COALESCE(hist.image_uri, tl.image_url, sc.image_url, pw.image_url) AS image_url,
  
  -- LAUNCHPAD
  COALESCE(tl.launchpad, sc.launchpad) AS launchpad,
  
  -- GRADUATION STATUS
  COALESCE(pw.is_graduated, false) AS is_graduated,
  pw.graduated_at,
  
  -- CREATOR / DEV WALLET
  COALESCE(pw.creator_wallet, sc.creator_wallet, tl.creator_wallet, dr.primary_dev_wallet) AS creator_wallet,
  COALESCE(md.dev_wallets, ARRAY[]::text[]) AS dev_wallets,
  
  -- KYC (from developer_profiles via creator wallet match)
  COALESCE(kyc1.kyc_verified, kyc2.kyc_verified, false) AS kyc_verified,
  COALESCE(kyc1.kyc_source, kyc2.kyc_source) AS kyc_source,
  
  -- DEV REPUTATION
  dr.dev_reputation_score,
  dr.dev_trust_level,
  dr.dev_pattern,
  dr.dev_total_launches,
  dr.dev_tokens_rugged,
  dr.dev_tokens_successful,
  COALESCE(dr.dev_auto_blacklisted, false) AS dev_auto_blacklisted,
  COALESCE(dr.dev_is_serial_spammer, false) AS dev_is_serial_spammer,
  COALESCE(dr.dev_is_legitimate_builder, false) AS dev_is_legitimate_builder,
  
  -- X COMMUNITIES (urls, names, admin handles, mod handles)
  COALESCE(ca.x_community_urls, ARRAY[]::text[]) AS x_community_urls,
  COALESCE(ca.x_community_names, ARRAY[]::text[]) AS x_community_names,
  COALESCE(ca.community_admin_handles, ARRAY[]::text[]) AS community_admin_handles,
  COALESCE(ca.community_mod_handles, ARRAY[]::text[]) AS community_mod_handles,
  
  -- MESH X HANDLES & WEBSITES
  COALESCE(mx.x_handles, ARRAY[]::text[]) AS mesh_x_handles,
  COALESCE(mw.websites, ARRAY[]::text[]) AS websites,
  
  -- TRACKING
  hist.was_posted

FROM all_mints am
LEFT JOIN holders_intel_seen_tokens hist ON hist.token_mint = am.token_mint
LEFT JOIN token_lifecycle tl ON tl.token_mint = am.token_mint
LEFT JOIN scraped_tokens sc ON sc.token_mint = am.token_mint
LEFT JOIN pumpfun_watchlist pw ON pw.token_mint = am.token_mint
LEFT JOIN community_agg ca ON ca.token_mint = am.token_mint
LEFT JOIN mesh_devs md ON md.token_mint = am.token_mint
LEFT JOIN mesh_websites mw ON mw.token_mint = am.token_mint
LEFT JOIN mesh_x mx ON mx.token_mint = am.token_mint
LEFT JOIN dev_rep dr ON dr.token_mint = am.token_mint
-- KYC: try matching via pumpfun creator, then scraped creator
LEFT JOIN kyc_data kyc1 ON kyc1.master_wallet_address = COALESCE(pw.creator_wallet, sc.creator_wallet, tl.creator_wallet)
LEFT JOIN kyc_data kyc2 ON kyc2.master_wallet_address = dr.primary_dev_wallet AND kyc1.master_wallet_address IS NULL;

-- Create unique index for CONCURRENTLY refresh
CREATE UNIQUE INDEX idx_master_token_directory_mint ON master_token_directory (token_mint);
CREATE INDEX idx_master_token_directory_symbol ON master_token_directory (symbol);
CREATE INDEX idx_master_token_directory_creator ON master_token_directory (creator_wallet);
CREATE INDEX idx_master_token_directory_graduated ON master_token_directory (is_graduated);
CREATE INDEX idx_master_token_directory_launchpad ON master_token_directory (launchpad);

-- Update refresh function
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
