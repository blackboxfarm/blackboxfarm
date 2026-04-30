delete from public.autopsy_candidates
where source_feed = 'pumpfun_curve_death'
  and (
    ath_mcap_usd is null
    or ath_mcap_usd < 51750
    or ath_mcap_usd >= 69000
    or bonding_curve_pct is null
    or bonding_curve_pct < 75
    or bonding_curve_pct >= 100
  );