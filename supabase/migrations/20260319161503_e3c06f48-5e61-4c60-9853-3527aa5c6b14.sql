
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
    SELECT token_mint FROM pumpfun_watchlist WHERE status NOT IN ('rejected','dead')
    UNION
    SELECT linked_id AS token_mint FROM reputation_mesh WHERE linked_type = 'token'
    UNION
    SELECT token_mint FROM funnel_feed_discoveries WHERE token_mint IS NOT NULL
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
  WHERE rm.linked_type = 'token' AND rm.source_type = 'wallet'
    AND rm.relationship IN ('created','created_token','dev_wallet')
  GROUP BY rm.linked_id
),
mesh_websites AS (
  SELECT w.token_mint, array_agg(DISTINCT w.site) AS websites
  FROM (
    SELECT rm.source_id AS token_mint, rm.linked_id AS site
    FROM reputation_mesh rm WHERE rm.source_type = 'token' AND rm.linked_type = 'website'
    UNION ALL
    SELECT rm.linked_id, rm.source_id
    FROM reputation_mesh rm WHERE rm.linked_type = 'token' AND rm.source_type = 'website'
  ) w
  GROUP BY w.token_mint
),
mesh_x AS (
  SELECT x.token_mint, array_agg(DISTINCT x.handle) AS x_handles
  FROM (
    SELECT rm.source_id AS token_mint, rm.linked_id AS handle
    FROM reputation_mesh rm WHERE rm.source_type = 'token' AND rm.linked_type = 'twitter'
    UNION ALL
    SELECT rm.linked_id, rm.source_id
    FROM reputation_mesh rm WHERE rm.linked_type = 'token' AND rm.source_type = 'twitter'
  ) x
  GROUP BY x.token_mint
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
  SELECT DISTINCT ON (dp.master_wallet_address) dp.master_wallet_address, dp.kyc_verified, dp.kyc_source
  FROM developer_profiles dp WHERE dp.kyc_verified = true
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
      CASE WHEN pw.token_mint IS NOT NULL THEN 'pump.fun' ELSE NULL END,
      CASE
        WHEN lower(am.token_mint) LIKE '%pump' THEN 'pump.fun'
        WHEN lower(am.token_mint) LIKE '%bonk' THEN 'bonk.fun'
        WHEN lower(am.token_mint) LIKE '%bags' THEN 'bags.fm'
        ELSE NULL
      END
    ) AS launchpad,
    COALESCE(pw.is_graduated, false) AS is_graduated,
    pw.graduated_at,
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
    COALESCE(fa.funnel_sources, ARRAY[]::text[]) AS funnel_sources,
    hist.was_posted,
    tl.ath_24h_usd,
    COALESCE(pw.created_at, tl.created_at, sc.created_at, hist.first_seen_at, ffd.discovered_at) AS created_at,
    CASE
      WHEN ffd.token_mint IS NOT NULL AND pw.token_mint IS NULL AND tl.token_mint IS NULL AND hist.token_mint IS NULL AND sc.token_mint IS NULL THEN 'funnel_feed'
      WHEN pw.token_mint IS NOT NULL THEN 'pump_monitor'
      WHEN tl.token_mint IS NOT NULL THEN 'lifecycle'
      WHEN hist.token_mint IS NOT NULL THEN 'holders_intel'
      WHEN sc.token_mint IS NOT NULL THEN 'scraper'
      ELSE 'mesh'
    END AS discovery_source,
    CASE
      WHEN pw.token_mint IS NOT NULL THEN 1
      WHEN tl.token_mint IS NOT NULL THEN 2
      WHEN hist.token_mint IS NOT NULL THEN 3
      WHEN ffd.token_mint IS NOT NULL THEN 4
      WHEN sc.token_mint IS NOT NULL THEN 5
      ELSE 6
    END AS source_priority,
    (CASE WHEN COALESCE(pw.creator_wallet, sc.creator_wallet, tl.creator_wallet, dr.primary_dev_wallet) IS NOT NULL THEN 1 ELSE 0 END
     + CASE WHEN COALESCE(array_length(md.dev_wallets, 1), 0) > 0 THEN 1 ELSE 0 END
     + CASE WHEN COALESCE(array_length(ca.x_community_urls, 1), 0) > 0 THEN 1 ELSE 0 END
     + CASE WHEN COALESCE(array_length(mx.x_handles, 1), 0) > 0 THEN 1 ELSE 0 END
     + CASE WHEN COALESCE(hist.was_posted, false) THEN 1 ELSE 0 END
    ) AS evidence_score
  FROM all_mints am
    LEFT JOIN holders_intel_seen_tokens hist ON hist.token_mint = am.token_mint
    LEFT JOIN token_lifecycle tl ON tl.token_mint = am.token_mint
    LEFT JOIN scraped_tokens sc ON sc.token_mint = am.token_mint
    LEFT JOIN pumpfun_watchlist pw ON pw.token_mint = am.token_mint
    LEFT JOIN funnel_feed_discoveries ffd ON ffd.token_mint = am.token_mint
    LEFT JOIN community_agg ca ON ca.token_mint = am.token_mint
    LEFT JOIN mesh_devs md ON md.token_mint = am.token_mint
    LEFT JOIN mesh_websites mw ON mw.token_mint = am.token_mint
    LEFT JOIN mesh_x mx ON mx.token_mint = am.token_mint
    LEFT JOIN funnel_agg fa ON fa.token_mint = am.token_mint
    LEFT JOIN dev_rep dr ON dr.token_mint = am.token_mint
    LEFT JOIN kyc_data kyc1 ON kyc1.master_wallet_address = COALESCE(pw.creator_wallet, sc.creator_wallet, tl.creator_wallet)
    LEFT JOIN kyc_data kyc2 ON kyc2.master_wallet_address = dr.primary_dev_wallet AND kyc1.master_wallet_address IS NULL
  WHERE COALESCE(pw.status, 'active') NOT IN ('rejected','dead')
),
ranked_rows AS (
  SELECT br.*,
    row_number() OVER (
      PARTITION BY CASE WHEN br.symbol IS NULL OR btrim(br.symbol) = '' THEN br.token_mint ELSE upper(br.symbol) END
      ORDER BY br.source_priority, br.evidence_score DESC, br.created_at DESC NULLS LAST, br.token_mint
    ) AS symbol_rank
  FROM base_rows br
)
SELECT token_mint, symbol, name, image_url, launchpad, is_graduated, graduated_at,
  creator_wallet, dev_wallets, kyc_verified, kyc_source,
  dev_reputation_score, dev_trust_level, dev_pattern,
  dev_total_launches, dev_tokens_rugged, dev_tokens_successful,
  dev_auto_blacklisted, dev_is_serial_spammer, dev_is_legitimate_builder,
  x_community_urls, x_community_names, community_admin_handles, community_mod_handles,
  mesh_x_handles, websites, funnel_sources, was_posted, ath_24h_usd, created_at,
  discovery_source
FROM ranked_rows
WHERE symbol_rank = 1;

CREATE UNIQUE INDEX ON master_token_directory (token_mint);
CREATE INDEX idx_master_token_dir_discovery ON master_token_directory (discovery_source);
CREATE INDEX idx_master_token_dir_funnel ON master_token_directory USING GIN (funnel_sources);
