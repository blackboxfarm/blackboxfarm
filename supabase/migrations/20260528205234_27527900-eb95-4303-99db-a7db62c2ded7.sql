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
  v_existing numeric;
  v_locked numeric;
BEGIN
  IF p_mint IS NULL OR length(p_mint) = 0 THEN
    RETURN NULL;
  END IF;
  IF p_observed IS NULL OR p_observed <= 0 OR NOT (p_observed = p_observed) THEN
    -- invalid observation, just return existing
    SELECT entry_market_cap INTO v_existing
      FROM public.telegram_insider_token_lifecycle
      WHERE token_mint = p_mint;
    RETURN v_existing;
  END IF;

  SELECT entry_market_cap INTO v_existing
    FROM public.telegram_insider_token_lifecycle
    WHERE token_mint = p_mint;

  IF NOT FOUND THEN
    INSERT INTO public.telegram_insider_token_lifecycle (
      token_mint, token_symbol, entry_market_cap, channel_name, first_called_at, built_at
    ) VALUES (
      p_mint, p_symbol, p_observed, 'observed', now(), now()
    )
    ON CONFLICT (token_mint) DO UPDATE
      SET entry_market_cap = LEAST(
            COALESCE(public.telegram_insider_token_lifecycle.entry_market_cap, EXCLUDED.entry_market_cap),
            EXCLUDED.entry_market_cap
          );
    RETURN p_observed;
  END IF;

  v_locked := LEAST(COALESCE(v_existing, p_observed), p_observed);

  IF v_existing IS DISTINCT FROM v_locked THEN
    UPDATE public.telegram_insider_token_lifecycle
       SET entry_market_cap = v_locked
     WHERE token_mint = p_mint;
  END IF;

  RETURN v_locked;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_entry_mcap(text, numeric, text) TO authenticated, service_role;