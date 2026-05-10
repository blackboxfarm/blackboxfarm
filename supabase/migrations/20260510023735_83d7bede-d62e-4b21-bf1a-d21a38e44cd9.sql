
-- 1. token_website_sources: append-only event log of where a token's website was seen
CREATE TABLE IF NOT EXISTS public.token_website_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  url TEXT NOT NULL,
  host TEXT,
  source TEXT NOT NULL CHECK (source IN ('launchpad','dexscreener_paid')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (token_mint, url, source)
);

CREATE INDEX IF NOT EXISTS idx_token_website_sources_mint ON public.token_website_sources(token_mint);

ALTER TABLE public.token_website_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read token_website_sources"
  ON public.token_website_sources FOR SELECT
  USING (true);

CREATE POLICY "Service role manages token_website_sources"
  ON public.token_website_sources FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- 2. developer_profiles.kyc_last_checked_at
ALTER TABLE public.developer_profiles
  ADD COLUMN IF NOT EXISTS kyc_last_checked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_developer_profiles_kyc_last_checked
  ON public.developer_profiles(kyc_last_checked_at NULLS FIRST);

-- 3. Rebuild master_token_directory with new columns
DROP MATERIALIZED VIEW IF EXISTS public.master_token_directory CASCADE;

CREATE MATERIALIZED VIEW public.master_token_directory AS
WITH all_mints AS (
  SELECT DISTINCT u.token_mint
  FROM (
    SELECT token_mint FROM holders_intel_seen_tokens
    UNION SELECT token_mint FROM scraped_tokens
    UNION SELECT token_mint FROM token_lifecycle
    UNION SELECT token_mint FROM pumpfun_watchlist WHERE status NOT IN ('rejected','dead')
    UNION SELECT linked_id FROM reputation_mesh WHERE linked_type='token'
    UNION SELECT token_mint FROM funnel_feed_discoveries WHERE token_mint IS NOT NULL
  ) u
  WHERE u.token_mint IS NOT NULL AND length(u.token_mint) >= 32
),
community_links AS (
  SELECT unnest(xc.linked_token_mints) AS token_mint,
         xc.community_url, xc.name AS community_name,
         xc.admin_usernames, xc.moderator_usernames
  FROM x_communities xc
  WHERE xc.linked_token_mints IS NOT NULL AND xc.is_deleted = false
),
community_agg AS (
  SELECT cl.token_mint,
    array_agg(DISTINCT cl.community_url) FILTER (WHERE cl.community_url IS NOT NULL) AS x_community_urls,
    array_agg(DISTINCT cl.community_name) FILTER (WHERE cl.community_name IS NOT NULL) AS x_community_names,
    array_agg(DISTINCT a.a) FILTER (WHERE a.a IS NOT NULL) AS community_admin_handles,
    array_agg(DISTINCT m.m) FILTER (WHERE m.m IS NOT NULL) AS community_mod_handles
  FROM community_links cl
  LEFT JOIN LATERAL unnest(cl.admin_usernames) a(a) ON true
  LEFT JOIN LATERAL unnest(cl.moderator_usernames) m(m) ON true
  GROUP BY cl.token_mint
),
mesh_devs AS (
  SELECT rm.linked_id AS token_mint, array_agg(DISTINCT rm.source_id) AS dev_wallets
  FROM reputation_mesh rm
  WHERE rm.linked_type='token' AND rm.source_type='wallet'
    AND rm.relationship IN ('created','created_token','dev_wallet')
  GROUP BY rm.linked_id
),
mesh_websites AS (
  SELECT w.token_mint, array_agg(DISTINCT w.site) AS websites
  FROM (
    SELECT rm.source_id AS token_mint, rm.linked_id AS site
      FROM reputation_mesh rm
     WHERE rm.source_type='token' AND rm.linked_type='website'
    UNION ALL
    SELECT rm.linked_id, rm.source_id
      FROM reputation_mesh rm
     WHERE rm.linked_type='token' AND rm.source_type='website'
  ) w
  GROUP BY w.token_mint
),
mesh_x AS (
  SELECT x.token_mint, array_agg(DISTINCT x.handle) AS x_handles
  FROM (
    SELECT rm.source_id AS token_mint, rm.linked_id AS handle
      FROM reputation_mesh rm
     WHERE rm.source_type='token' AND rm.linked_type='twitter'
    UNION ALL
    SELECT rm.linked_id, rm.source_id
      FROM reputation_mesh rm
     WHERE rm.linked_type='token' AND rm.source_type='twitter'
  ) x
  GROUP BY x.token_mint
),
website_sources_agg AS (
  SELECT token_mint,
    jsonb_agg(jsonb_build_object('url', url, 'sources', sources, 'host', host)
              ORDER BY url) AS website_sources
  FROM (
    SELECT token_mint, url, max(host) AS host,
           array_agg(DISTINCT source ORDER BY source) AS sources
    FROM token_website_sources
    GROUP BY token_mint, url
  ) s
  GROUP BY token_mint
),
dev_rep AS (
  SELECT md.token_mint,
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
kyc_data AS (
  SELECT DISTINCT ON (dp.master_wallet_address)
         dp.master_wallet_address, dp.kyc_verified, dp.kyc_source
  FROM developer_profiles dp
  WHERE dp.kyc_verified = true
),
funnel_agg AS (
  SELECT ffd.token_mint,
    array_agg(DISTINCT ffs.source_name) FILTER (WHERE ffs.source_name IS NOT NULL) AS funnel_sources
  FROM funnel_feed_discoveries ffd
  LEFT JOIN funnel_feed_sources ffs ON ffs.id = ffd.source_id
  WHERE ffd.token_mint IS NOT NULL
  GROUP BY ffd.token_mint
),
base_rows AS (
  SELECT am.token_mint,
    COALESCE(hist.symbol, tl.symbol, sc.symbol, pw.token_symbol, ffd.token_symbol) AS symbol,
    COALESCE(hist.name, tl.name, sc.name, pw.token_name, ffd.token_name) AS name,
    COALESCE(hist.image_uri, tl.image_url, sc.image_url, pw.image_url) AS image_url,
    COALESCE(tl.launchpad, sc.launchpad,
      CASE WHEN pw.token_mint IS NOT NULL THEN 'pump.fun'
           WHEN lower(am.token_mint) LIKE '%pump' THEN 'pump.fun'
           WHEN lower(am.token_mint) LIKE '%bonk' THEN 'bonk.fun'
           WHEN lower(am.token_mint) LIKE '%bags' THEN 'bags.fm'
      END) AS launchpad,
    -- Augmented graduation: explicit flag OR ATH ≥ $69k OR raydium pool present
    (COALESCE(pw.is_graduated, false)
     OR COALESCE(pw.ath_market_cap_usd, 0) >= 69000
     OR pw.raydium_pool_address IS NOT NULL) AS is_graduated,
    COALESCE(pw.graduated_at, pw.ath_market_cap_at) AS graduated_at,
    COALESCE(pw.creator_wallet, sc.creator_wallet, tl.creator_wallet, dr.primary_dev_wallet, ffd.creator_wallet) AS creator_wallet,
    COALESCE(md.dev_wallets, ARRAY[]::text[]) AS dev_wallets,
    COALESCE(kyc1.kyc_verified, kyc2.kyc_verified, false) AS kyc_verified,
    COALESCE(kyc1.kyc_source, kyc2.kyc_source) AS kyc_source,
    dr.dev_reputation_score, dr.dev_trust_level, dr.dev_pattern,
    dr.dev_total_launches, dr.dev_tokens_rugged, dr.dev_tokens_successful,
    COALESCE(dr.dev_auto_blacklisted, false) AS dev_auto_blacklisted,
    COALESCE(dr.dev_is_serial_spammer, false) AS dev_is_serial_spammer,
    COALESCE(dr.dev_is_legitimate_builder, false) AS dev_is_legitimate_builder,
    COALESCE(ca.x_community_urls, ARRAY[]::text[]) AS x_community_urls,
    COALESCE(ca.x_community_names, ARRAY[]::text[]) AS x_community_names,
    COALESCE(ca.community_admin_handles, ARRAY[]::text[]) AS community_admin_handles,
    COALESCE(ca.community_mod_handles, ARRAY[]::text[]) AS community_mod_handles,
    COALESCE(mx.x_handles, ARRAY[]::text[]) AS mesh_x_handles,
    COALESCE(mw.websites, ARRAY[]::text[]) AS websites,
    COALESCE(ws.website_sources, '[]'::jsonb) AS website_sources,
    COALESCE(fa.funnel_sources, ARRAY[]::text[]) AS funnel_sources,
    hist.was_posted,
    tl.ath_24h_usd,
    pw.ath_market_cap_usd,
    pw.ath_market_cap_at,
    COALESCE(pw.created_at, tl.created_at, sc.created_at, hist.first_seen_at, ffd.discovered_at) AS created_at,
    CASE
      WHEN ffd.token_mint IS NOT NULL AND pw.token_mint IS NULL AND tl.token_mint IS NULL AND hist.token_mint IS NULL AND sc.token_mint IS NULL THEN 'funnel_feed'
      WHEN pw.token_mint IS NOT NULL THEN 'pump_monitor'
      WHEN tl.token_mint IS NOT NULL THEN 'lifecycle'
      WHEN hist.token_mint IS NOT NULL THEN 'holders_intel'
      WHEN sc.token_mint IS NOT NULL THEN 'scraper'
      ELSE 'mesh'
    END AS discovery_source
  FROM all_mints am
  LEFT JOIN holders_intel_seen_tokens hist ON hist.token_mint = am.token_mint
  LEFT JOIN token_lifecycle tl ON tl.token_mint = am.token_mint
  LEFT JOIN scraped_tokens sc ON sc.token_mint = am.token_mint
  LEFT JOIN pumpfun_watchlist pw ON pw.token_mint = am.token_mint
  LEFT JOIN funnel_feed_discoveries ffd ON ffd.token_mint = am.token_mint
  LEFT JOIN community_agg ca ON ca.token_mint = am.token_mint
  LEFT JOIN mesh_devs md ON md.token_mint = am.token_mint
  LEFT JOIN mesh_websites mw ON mw.token_mint = am.token_mint
  LEFT JOIN website_sources_agg ws ON ws.token_mint = am.token_mint
  LEFT JOIN mesh_x mx ON mx.token_mint = am.token_mint
  LEFT JOIN funnel_agg fa ON fa.token_mint = am.token_mint
  LEFT JOIN dev_rep dr ON dr.token_mint = am.token_mint
  LEFT JOIN kyc_data kyc1 ON kyc1.master_wallet_address = COALESCE(pw.creator_wallet, sc.creator_wallet, tl.creator_wallet)
  LEFT JOIN kyc_data kyc2 ON kyc2.master_wallet_address = dr.primary_dev_wallet AND kyc1.master_wallet_address IS NULL
  WHERE COALESCE(pw.status, 'active') NOT IN ('rejected','dead')
)
SELECT
  token_mint, symbol, name, image_url, launchpad,
  is_graduated, graduated_at,
  creator_wallet, dev_wallets,
  kyc_verified, kyc_source,
  dev_reputation_score, dev_trust_level, dev_pattern,
  dev_total_launches, dev_tokens_rugged, dev_tokens_successful,
  dev_auto_blacklisted, dev_is_serial_spammer, dev_is_legitimate_builder,
  x_community_urls, x_community_names, community_admin_handles, community_mod_handles,
  mesh_x_handles, websites, website_sources, funnel_sources, was_posted,
  ath_24h_usd, ath_market_cap_usd, ath_market_cap_at,
  created_at, discovery_source
FROM base_rows;

CREATE UNIQUE INDEX IF NOT EXISTS master_token_directory_token_mint_idx
  ON public.master_token_directory (token_mint);
CREATE INDEX IF NOT EXISTS master_token_directory_symbol_idx
  ON public.master_token_directory (symbol);
CREATE INDEX IF NOT EXISTS master_token_directory_created_at_idx
  ON public.master_token_directory (created_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS master_token_directory_discovery_source_idx
  ON public.master_token_directory (discovery_source);
