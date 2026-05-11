CREATE OR REPLACE FUNCTION public.get_birdeye_master_impact(window_hours integer DEFAULT 24)
RETURNS TABLE (
  unique_mints_resolved bigint,
  unique_creators bigint,
  in_master_with_creator bigint,
  in_master_missing_creator bigint,
  excluded_dead_or_rejected bigint,
  not_in_master bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH be AS (
    SELECT DISTINCT token_mint, resolved_creator
    FROM public.birdeye_api_usage
    WHERE timestamp >= now() - make_interval(hours => window_hours)
      AND resolved_creator IS NOT NULL
  ),
  joined AS (
    SELECT
      be.token_mint,
      be.resolved_creator,
      m.token_mint  AS master_mint,
      m.creator_wallet AS master_creator,
      pw.status     AS pumpfun_status
    FROM be
    LEFT JOIN public.master_token_directory m ON m.token_mint = be.token_mint
    LEFT JOIN public.pumpfun_watchlist pw     ON pw.token_mint = be.token_mint
  )
  SELECT
    (SELECT count(DISTINCT token_mint) FROM be)                                              AS unique_mints_resolved,
    (SELECT count(DISTINCT resolved_creator) FROM be)                                        AS unique_creators,
    count(*) FILTER (WHERE master_mint IS NOT NULL AND master_creator IS NOT NULL)           AS in_master_with_creator,
    count(*) FILTER (WHERE master_mint IS NOT NULL AND master_creator IS NULL)               AS in_master_missing_creator,
    count(*) FILTER (WHERE master_mint IS NULL AND pumpfun_status IN ('dead','rejected'))    AS excluded_dead_or_rejected,
    count(*) FILTER (WHERE master_mint IS NULL AND (pumpfun_status IS NULL OR pumpfun_status NOT IN ('dead','rejected'))) AS not_in_master
  FROM joined;
$$;

GRANT EXECUTE ON FUNCTION public.get_birdeye_master_impact(integer) TO authenticated;