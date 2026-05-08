CREATE OR REPLACE FUNCTION public.passes_worth_gate(p_token_mint TEXT)
RETURNS TABLE(passes BOOLEAN, reasons JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reasons JSONB := '[]'::jsonb;
  v_lc RECORD;
  v_socials INT := 0;
BEGIN
  SELECT
    tl.market_cap, tl.ath_24h_usd, tl.liquidity_usd, tl.first_seen_at,
    tl.is_currently_top_200, tl.times_entered_top_200, tl.current_status, tl.metadata
  INTO v_lc
  FROM public.token_lifecycle tl
  WHERE tl.token_mint = p_token_mint
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, '["no_lifecycle_row"]'::jsonb;
    RETURN;
  END IF;

  IF COALESCE(v_lc.ath_24h_usd, 0) >= 25000 OR COALESCE(v_lc.market_cap, 0) >= 25000 THEN
    v_reasons := v_reasons || '"peak_mcap_25k"'::jsonb;
  END IF;

  IF v_lc.first_seen_at IS NOT NULL
     AND v_lc.first_seen_at < (now() - interval '6 hours')
     AND COALESCE(v_lc.liquidity_usd, 0) >= 5000 THEN
    v_reasons := v_reasons || '"6h_5k_liq"'::jsonb;
  END IF;

  IF COALESCE(v_lc.times_entered_top_200, 0) >= 1 OR COALESCE(v_lc.is_currently_top_200, false) THEN
    v_reasons := v_reasons || '"top_200"'::jsonb;
  END IF;

  IF v_lc.current_status = 'graduated' OR (v_lc.metadata ? 'graduated_at') THEN
    v_reasons := v_reasons || '"graduated"'::jsonb;
  END IF;

  SELECT COUNT(*) INTO v_socials
  FROM public.token_social_links sl
  WHERE sl.token_mint = p_token_mint
    AND COALESCE(sl.is_current, false) = true;

  IF v_socials >= 1 THEN
    v_reasons := v_reasons || '"verified_social"'::jsonb;
  END IF;

  RETURN QUERY SELECT (jsonb_array_length(v_reasons) > 0), v_reasons;
END;
$$;