
-- Drop old limited view
DROP MATERIALIZED VIEW IF EXISTS master_token_directory;

-- THE REAL MASTER DATABASE: Every token, all identity, all social, dev rep
CREATE MATERIALIZED VIEW master_token_directory AS
WITH 
-- Step 1: EVERY unique token mint from ALL sources
all_mints AS (
  SELECT DISTINCT token_mint FROM (
    SELECT token_mint FROM holders_intel_seen_tokens
    UNION SELECT token_mint FROM scraped_tokens
    UNION SELECT token_mint FROM token_lifecycle
    UNION SELECT linked_id AS token_mint FROM reputation_mesh WHERE linked_type = 'token'
  ) u
  WHERE token_mint IS NOT NULL AND length(token_mint) >= 32
),

-- Step 2: Community aggregation
community_links AS (
  SELECT unnest(xc.linked_token_mints) AS token_mint,
    xc.community_url,
    xc.name AS community_name,
    xc.admin_usernames,
    xc.moderator_usernames
  FROM x_communities xc
  WHERE xc.linked_token_mints IS NOT NULL AND xc.is_deleted = false
),
community_agg AS (
  SELECT cl.token_mint,
    array_agg(DISTINCT cl.community_url) FILTER (WHERE cl.community_url IS NOT NULL) AS x_community_urls,
    array_agg(DISTINCT cl.community_name) FILTER (WHERE cl.community_name IS NOT NULL) AS x_community_names,
    array_agg(DISTINCT a.a) FILTER (WHERE a.a IS NOT NULL) AS admin_handles,
    array_agg(DISTINCT m.m) FILTER (WHERE m.m IS NOT NULL) AS mod_handles
  FROM community_links cl
    LEFT JOIN LATERAL unnest(cl.admin_usernames) a(a) ON true
    LEFT JOIN LATERAL unnest(cl.moderator_usernames) m(m) ON true
  GROUP BY cl.token_mint
),

-- Step 3: Dev wallets from mesh
mesh_devs AS (
  SELECT rm.linked_id AS token_mint,
    array_agg(DISTINCT rm.source_id) AS dev_wallets
  FROM reputation_mesh rm
  WHERE rm.linked_type = 'token' AND rm.source_type = 'wallet'
    AND rm.relationship IN ('created', 'created_token', 'dev_wallet')
  GROUP BY rm.linked_id
),

-- Step 4: Websites from mesh (both directions)
mesh_websites AS (
  SELECT token_mint, array_agg(DISTINCT site) AS websites FROM (
    SELECT rm.source_id AS token_mint, rm.linked_id AS site
    FROM reputation_mesh rm WHERE rm.source_type = 'token' AND rm.linked_type = 'website'
    UNION ALL
    SELECT rm.linked_id AS token_mint, rm.source_id AS site
    FROM reputation_mesh rm WHERE rm.linked_type = 'token' AND rm.source_type = 'website'
  ) w GROUP BY token_mint
),

-- Step 5: X handles from mesh (both directions)
mesh_x AS (
  SELECT token_mint, array_agg(DISTINCT handle) AS x_handles FROM (
    SELECT rm.source_id AS token_mint, rm.linked_id AS handle
    FROM reputation_mesh rm WHERE rm.source_type = 'token' AND rm.linked_type = 'twitter'
    UNION ALL
    SELECT rm.linked_id AS token_mint, rm.source_id AS handle
    FROM reputation_mesh rm WHERE rm.linked_type = 'token' AND rm.source_type = 'twitter'
  ) x GROUP BY token_mint
),

-- Step 6: Best dev reputation per token (via mesh dev wallets)
dev_rep AS (
  SELECT md.token_mint,
    -- Pick the dev wallet with highest rep score
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
)

SELECT
  -- TOKEN IDENTITY
  am.token_mint,
  COALESCE(hist.symbol, tl.symbol, sc.symbol) AS symbol,
  COALESCE(hist.name, tl.name, sc.name) AS name,
  COALESCE(hist.image_uri, tl.image_url, sc.image_url) AS image_url,
  COALESCE(tl.launchpad, sc.launchpad) AS launchpad,
  tl.pair_address,
  tl.dex_id,
  COALESCE(sc.creator_wallet, tl.creator_wallet) AS creator_wallet,

  -- DEV WALLETS (all known)
  COALESCE(md.dev_wallets, ARRAY[]::text[]) AS dev_wallets,

  -- DEV REPUTATION
  dr.primary_dev_wallet,
  dr.dev_reputation_score,
  dr.dev_trust_level,
  dr.dev_pattern,
  dr.dev_total_launches,
  dr.dev_tokens_rugged,
  dr.dev_tokens_successful,
  COALESCE(dr.dev_auto_blacklisted, false) AS dev_auto_blacklisted,
  COALESCE(dr.dev_is_serial_spammer, false) AS dev_is_serial_spammer,
  COALESCE(dr.dev_is_legitimate_builder, false) AS dev_is_legitimate_builder,

  -- TOKEN GRADE (from holders intel)
  hist.health_grade AS token_health_grade,
  hist.was_posted,

  -- SOCIAL & COMMUNITY
  COALESCE(ca.x_community_urls, ARRAY[]::text[]) AS x_community_urls,
  COALESCE(ca.x_community_names, ARRAY[]::text[]) AS x_community_names,
  COALESCE(ca.admin_handles, ARRAY[]::text[]) AS community_admin_handles,
  COALESCE(ca.mod_handles, ARRAY[]::text[]) AS community_mod_handles,
  COALESCE(mx.x_handles, ARRAY[]::text[]) AS mesh_x_handles,
  COALESCE(mw.websites, ARRAY[]::text[]) AS websites

FROM all_mints am
  LEFT JOIN holders_intel_seen_tokens hist ON hist.token_mint = am.token_mint
  LEFT JOIN token_lifecycle tl ON tl.token_mint = am.token_mint
  LEFT JOIN scraped_tokens sc ON sc.token_mint = am.token_mint
  LEFT JOIN community_agg ca ON ca.token_mint = am.token_mint
  LEFT JOIN mesh_devs md ON md.token_mint = am.token_mint
  LEFT JOIN mesh_websites mw ON mw.token_mint = am.token_mint
  LEFT JOIN mesh_x mx ON mx.token_mint = am.token_mint
  LEFT JOIN dev_rep dr ON dr.token_mint = am.token_mint;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX idx_master_token_directory_mint ON master_token_directory (token_mint);
CREATE INDEX idx_master_token_directory_symbol ON master_token_directory (symbol);
CREATE INDEX idx_master_token_directory_dev ON master_token_directory (primary_dev_wallet);

-- Populate
REFRESH MATERIALIZED VIEW master_token_directory;
