-- Extend lock_entry_mcap so it pulls the lowest known market cap from EVERY
-- source we observe (Insiders scrape, BlackBox/Dex sweeps, HoldersIntel
-- discovery + persisted floor) and locks the lifecycle row's
-- entry_market_cap to that single, downward-only minimum. Also mirrors the
-- locked floor back into holders_intel_seen_tokens.entry_mcap_usd so the
-- {mcEntry} that compose renders matches the baseline orchestrate uses for
-- the multiplier math.

CREATE OR REPLACE FUNCTION public.lock_entry_mcap(
  p_mint text,
  p_observed numeric,
  p_symbol text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lc_existing       numeric;
  v_seen_persisted    numeric;
  v_seen_discovery    numeric;
  v_insiders_min_call numeric;
  v_locked            numeric;
BEGIN
  IF p_mint IS NULL OR length(p_mint) = 0 THEN
    RETURN NULL;
  END IF;

  -- Existing lifecycle floor.
  SELECT entry_market_cap INTO v_lc_existing
    FROM public.telegram_insider_token_lifecycle
    WHERE token_mint = p_mint;

  -- HoldersIntel persisted floor + first-discovery observation.
  SELECT entry_mcap_usd, market_cap_at_discovery
    INTO v_seen_persisted, v_seen_discovery
    FROM public.holders_intel_seen_tokens
    WHERE token_mint = p_mint;

  -- Lowest Insiders scrape mcap ever recorded for this mint.
  SELECT MIN(market_cap_at_call) INTO v_insiders_min_call
    FROM public.telegram_channel_calls
    WHERE token_mint = p_mint
      AND market_cap_at_call IS NOT NULL
      AND market_cap_at_call > 0;

  -- Reduce to the single lowest positive value across every source.
  SELECT MIN(v) INTO v_locked
  FROM (
    VALUES
      (v_lc_existing),
      (v_seen_persisted),
      (v_seen_discovery),
      (v_insiders_min_call),
      (CASE WHEN p_observed IS NOT NULL AND p_observed > 0
              AND p_observed = p_observed
            THEN p_observed END)
  ) AS s(v)
  WHERE v IS NOT NULL AND v > 0;

  IF v_locked IS NULL THEN
    RETURN v_lc_existing;
  END IF;

  -- Upsert lifecycle row carrying the locked floor.
  IF v_lc_existing IS NULL THEN
    INSERT INTO public.telegram_insider_token_lifecycle (
      token_mint, token_symbol, entry_market_cap,
      channel_name, first_called_at, built_at
    ) VALUES (
      p_mint, p_symbol, v_locked, 'observed', now(), now()
    )
    ON CONFLICT (token_mint) DO UPDATE
      SET entry_market_cap = LEAST(
            COALESCE(telegram_insider_token_lifecycle.entry_market_cap, EXCLUDED.entry_market_cap),
            EXCLUDED.entry_market_cap
          );
  ELSIF v_lc_existing IS DISTINCT FROM v_locked THEN
    UPDATE public.telegram_insider_token_lifecycle
       SET entry_market_cap = v_locked
     WHERE token_mint = p_mint;
  END IF;

  -- Mirror the lock back to HoldersIntel so {mcEntry} stays in sync.
  IF v_seen_persisted IS NULL OR v_seen_persisted IS DISTINCT FROM v_locked THEN
    UPDATE public.holders_intel_seen_tokens
       SET entry_mcap_usd = v_locked
     WHERE token_mint = p_mint
       AND (entry_mcap_usd IS NULL OR entry_mcap_usd > v_locked);
  END IF;

  RETURN v_locked;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_entry_mcap(text, numeric, text) TO authenticated, service_role;