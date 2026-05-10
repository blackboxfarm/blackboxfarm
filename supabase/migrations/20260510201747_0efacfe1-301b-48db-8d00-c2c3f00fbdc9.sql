ALTER TABLE public.holders_intel_seen_tokens
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS launchpad TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS telegram_url TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS creator_wallet TEXT,
  ADD COLUMN IF NOT EXISTS metadata_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS creator_fetched_at TIMESTAMPTZ;

ALTER TABLE public.scraped_tokens
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS telegram_url TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT;

ALTER TABLE public.token_lifecycle
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS telegram_url TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT;

ALTER TABLE public.funnel_feed_discoveries
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS launchpad TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS twitter_url TEXT,
  ADD COLUMN IF NOT EXISTS telegram_url TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS metadata_fetched_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS creator_fetched_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_holders_seen_metadata_gaps
  ON public.holders_intel_seen_tokens(token_mint)
  WHERE symbol IS NULL OR name IS NULL OR image_uri IS NULL OR creator_wallet IS NULL OR launchpad IS NULL OR metadata_fetched_at IS NULL OR creator_fetched_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lifecycle_metadata_gaps
  ON public.token_lifecycle(token_mint)
  WHERE symbol IS NULL OR name IS NULL OR image_url IS NULL OR creator_wallet IS NULL OR launchpad IS NULL OR description IS NULL;

CREATE INDEX IF NOT EXISTS idx_funnel_metadata_gaps
  ON public.funnel_feed_discoveries(token_mint)
  WHERE token_symbol IS NULL OR token_name IS NULL OR image_url IS NULL OR creator_wallet IS NULL OR launchpad IS NULL OR metadata_fetched_at IS NULL;

DROP MATERIALIZED VIEW IF EXISTS public.master_token_directory CASCADE;

CREATE MATERIALIZED VIEW public.master_token_directory AS
WITH all_mints AS (
  SELECT DISTINCT u.token_mint
  FROM (
    SELECT token_mint FROM public.holders_intel_seen_tokens
    UNION SELECT token_mint FROM public.scraped_tokens
    UNION SELECT token_mint FROM public.token_lifecycle
    UNION SELECT token_mint FROM public.pumpfun_watchlist WHERE status NOT IN ('rejected','dead')
    UNION SELECT linked_id FROM public.reputation_mesh WHERE linked_type='token'
    UNION SELECT token_mint FROM public.funnel_feed_discoveries WHERE token_mint IS NOT NULL
    UNION SELECT token_mint FROM public.token_social_links WHERE token_mint IS NOT NULL
  ) u
  WHERE u.token_mint IS NOT NULL AND length(u.token_mint) >= 32
),
community_links AS (
  SELECT unnest(xc.linked_token_mints) AS token_mint,
         xc.community_url, xc.name AS community_name,
         xc.admin_usernames, xc.moderator_usernames
  FROM public.x_communities xc
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
social_links_agg AS (
  SELECT token_mint,
    array_agg(DISTINCT url) FILTER (WHERE platform IN ('twitter','x') OR link_type IN ('twitter','x_handle','x_community')) AS x_urls,
    array_agg(DISTINCT url) FILTER (WHERE platform='telegram' OR link_type='telegram') AS telegram_urls,
    array_agg(DISTINCT url) FILTER (WHERE platform='website' OR link_type='website') AS website_urls,
    array_agg(DISTINCT extracted_handle) FILTER (WHERE extracted_handle IS NOT NULL AND (platform IN ('twitter','x') OR link_type IN ('twitter','x_handle'))) AS x_handles
  FROM public.token_social_links
  WHERE is_current IS DISTINCT FROM false
  GROUP BY token_mint
),
mesh_devs AS (
  SELECT rm.linked_id AS token_mint, array_agg(DISTINCT rm.source_id) AS dev_wallets
  FROM public.reputation_mesh rm
  WHERE rm.linked_type='token' AND rm.source_type='wallet'
    AND rm.relationship IN ('created','created_token','dev_wallet')
  GROUP BY rm.linked_id
),
mesh_websites AS (
  SELECT w.token_mint, array_agg(DISTINCT w.site) AS websites
  FROM (
    SELECT rm.source_id AS token_mint, rm.linked_id AS site
      FROM public.reputation_mesh rm
     WHERE rm.source_type='token' AND rm.linked_type='website'
    UNION ALL
    SELECT rm.linked_id, rm.source_id
      FROM public.reputation_mesh rm
     WHERE rm.linked_type='token' AND rm.source_type='website'
  ) w
  GROUP BY w.token_mint
),
mesh_x AS (
  SELECT x.token_mint, array_agg(DISTINCT x.handle) AS x_handles
  FROM (
    SELECT rm.source_id AS token_mint, rm.linked_id AS handle
      FROM public.reputation_mesh rm
     WHERE rm.source_type='token' AND rm.linked_type IN ('twitter','x_account')
    UNION ALL
    SELECT rm.linked_id, rm.source_id
      FROM public.reputation_mesh rm
     WHERE rm.linked_type='token' AND rm.source_type IN ('twitter','x_account')
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
    FROM public.token_website_sources
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
  LEFT JOIN public.dev_wallet_reputation dwr ON dwr.wallet_address = dw.dw
  GROUP BY md.token_mint
),
kyc_data AS (
  SELECT DISTINCT ON (dp.master_wallet_address)
         dp.master_wallet_address, dp.kyc_verified, dp.kyc_source
  FROM public.developer_profiles dp
  WHERE dp.kyc_verified = true
),
funnel_agg AS (
  SELECT ffd.token_mint,
    array_agg(DISTINCT ffs.source_name) FILTER (WHERE ffs.source_name IS NOT NULL) AS funnel_sources
  FROM public.funnel_feed_discoveries ffd
  LEFT JOIN public.funnel_feed_sources ffs ON ffs.id = ffd.source_id
  WHERE ffd.token_mint IS NOT NULL
  GROUP BY ffd.token_mint
),
base_rows AS (
  SELECT am.token_mint,
    COALESCE(hist.symbol, tl.symbol, sc.symbol, pw.token_symbol, ffd.token_symbol) AS symbol,
    COALESCE(hist.name, tl.name, sc.name, pw.token_name, ffd.token_name) AS name,
    COALESCE(hist.image_uri, tl.image_url, sc.image_url, pw.image_url, ffd.image_url) AS image_url,
    COALESCE(hist.description, tl.description, tl.metadata->>'description', sc.description, pw.metadata->>'description', ffd.description) AS description,
    COALESCE(hist.launchpad, tl.launchpad, sc.launchpad, ffd.launchpad,
      CASE WHEN pw.token_mint IS NOT NULL THEN 'pump.fun'
           WHEN lower(am.token_mint) LIKE '%pump' THEN 'pump.fun'
           WHEN lower(am.token_mint) LIKE '%bonk' THEN 'bonk.fun'
           WHEN lower(am.token_mint) LIKE '%bags' THEN 'bags.fm'
      END) AS launchpad,
    (COALESCE(pw.is_graduated, false)
     OR COALESCE(pw.ath_market_cap_usd, 0) >= 69000
     OR pw.raydium_pool_address IS NOT NULL) AS is_graduated,
    COALESCE(pw.graduated_at, pw.ath_market_cap_at) AS graduated_at,
    COALESCE(pw.creator_wallet, hist.creator_wallet, sc.creator_wallet, tl.creator_wallet, dr.primary_dev_wallet, ffd.creator_wallet) AS creator_wallet,
    COALESCE(md.dev_wallets, CASE WHEN COALESCE(pw.creator_wallet, hist.creator_wallet, sc.creator_wallet, tl.creator_wallet, ffd.creator_wallet) IS NOT NULL THEN ARRAY[COALESCE(pw.creator_wallet, hist.creator_wallet, sc.creator_wallet, tl.creator_wallet, ffd.creator_wallet)] ELSE ARRAY[]::text[] END) AS dev_wallets,
    COALESCE(kyc1.kyc_verified, kyc2.kyc_verified, false) AS kyc_verified,
    COALESCE(kyc1.kyc_source, kyc2.kyc_source) AS kyc_source,
    dr.dev_reputation_score, dr.dev_trust_level, dr.dev_pattern,
    dr.dev_total_launches, dr.dev_tokens_rugged, dr.dev_tokens_successful,
    COALESCE(dr.dev_auto_blacklisted, false) AS dev_auto_blacklisted,
    COALESCE(dr.dev_is_serial_spammer, false) AS dev_is_serial_spammer,
    COALESCE(dr.dev_is_legitimate_builder, false) AS dev_is_legitimate_builder,
    COALESCE(ca.x_community_urls, sl.x_urls, ARRAY[]::text[]) AS x_community_urls,
    COALESCE(ca.x_community_names, ARRAY[]::text[]) AS x_community_names,
    COALESCE(ca.community_admin_handles, ARRAY[]::text[]) AS community_admin_handles,
    COALESCE(ca.community_mod_handles, ARRAY[]::text[]) AS community_mod_handles,
    COALESCE(mx.x_handles, sl.x_handles, ARRAY[]::text[]) AS mesh_x_handles,
    COALESCE(mw.websites, sl.website_urls, ARRAY[]::text[]) AS websites,
    COALESCE(hist.twitter_url, tl.twitter_url, sc.twitter_url, pw.twitter_url, ffd.twitter_url, (sl.x_urls)[1]) AS twitter_url,
    COALESCE(hist.telegram_url, tl.telegram_url, sc.telegram_url, pw.telegram_url, ffd.telegram_url, (sl.telegram_urls)[1]) AS telegram_url,
    COALESCE(hist.website_url, tl.website_url, sc.website_url, pw.website_url, ffd.website_url, (sl.website_urls)[1]) AS website_url,
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
  LEFT JOIN public.holders_intel_seen_tokens hist ON hist.token_mint = am.token_mint
  LEFT JOIN public.token_lifecycle tl ON tl.token_mint = am.token_mint
  LEFT JOIN public.scraped_tokens sc ON sc.token_mint = am.token_mint
  LEFT JOIN public.pumpfun_watchlist pw ON pw.token_mint = am.token_mint
  LEFT JOIN public.funnel_feed_discoveries ffd ON ffd.token_mint = am.token_mint
  LEFT JOIN community_agg ca ON ca.token_mint = am.token_mint
  LEFT JOIN mesh_devs md ON md.token_mint = am.token_mint
  LEFT JOIN mesh_websites mw ON mw.token_mint = am.token_mint
  LEFT JOIN website_sources_agg ws ON ws.token_mint = am.token_mint
  LEFT JOIN mesh_x mx ON mx.token_mint = am.token_mint
  LEFT JOIN social_links_agg sl ON sl.token_mint = am.token_mint
  LEFT JOIN funnel_agg fa ON fa.token_mint = am.token_mint
  LEFT JOIN dev_rep dr ON dr.token_mint = am.token_mint
  LEFT JOIN kyc_data kyc1 ON kyc1.master_wallet_address = COALESCE(pw.creator_wallet, hist.creator_wallet, sc.creator_wallet, tl.creator_wallet, ffd.creator_wallet)
  LEFT JOIN kyc_data kyc2 ON kyc2.master_wallet_address = dr.primary_dev_wallet AND kyc1.master_wallet_address IS NULL
  WHERE COALESCE(pw.status, 'active') NOT IN ('rejected','dead')
)
SELECT
  token_mint, symbol, name, image_url, description, launchpad,
  is_graduated, graduated_at,
  creator_wallet, dev_wallets,
  kyc_verified, kyc_source,
  dev_reputation_score, dev_trust_level, dev_pattern,
  dev_total_launches, dev_tokens_rugged, dev_tokens_successful,
  dev_auto_blacklisted, dev_is_serial_spammer, dev_is_legitimate_builder,
  x_community_urls, x_community_names, community_admin_handles, community_mod_handles,
  mesh_x_handles, websites, twitter_url, telegram_url, website_url, website_sources, funnel_sources, was_posted,
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
CREATE INDEX IF NOT EXISTS master_token_directory_creator_idx
  ON public.master_token_directory (creator_wallet);

CREATE OR REPLACE FUNCTION public.refresh_master_token_directory()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.master_token_directory;
END;
$function$;