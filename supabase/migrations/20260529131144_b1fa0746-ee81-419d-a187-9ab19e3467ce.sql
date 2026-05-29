-- Mesh-first Entry MC upsert with discovery-window guard.
-- The lowest-MC comparison is ONLY valid during the initial discovery window
-- (default 30 min from first_seen_at). After that, any lower MC seen in the
-- wild is a price dump, not a better entry, and MUST NOT lower the locked
-- Entry MC. Authorized sources during the window: insiders, blackbox (Phanes,
-- DrRick), holdersintel.

CREATE OR REPLACE FUNCTION public.upsert_mesh_entry_mcap(
  p_mint text,
  p_symbol text DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_observed_mcap numeric DEFAULT NULL,
  p_source text DEFAULT 'unknown',
  p_observed_at timestamptz DEFAULT now()
)
RETURNS TABLE(entry_mcap_usd numeric, first_seen_at timestamptz, within_window boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_entry numeric;
  v_existing_first timestamptz;
  v_window_minutes int := 30;
  v_within_window boolean;
  v_authorized boolean;
  v_new_entry numeric;
  v_now timestamptz := now();
BEGIN
  IF p_mint IS NULL OR length(p_mint) < 32 THEN
    RETURN;
  END IF;

  -- Authorized sources for Entry MC comparison during discovery window.
  v_authorized := lower(coalesce(p_source,'')) IN (
    'insiders','blackbox','phanes','drrick','holdersintel','bagless'
  );

  SELECT t.entry_mcap_usd, t.first_seen_at
    INTO v_existing_entry, v_existing_first
    FROM public.holders_intel_seen_tokens t
    WHERE t.token_mint = p_mint;

  IF v_existing_first IS NULL THEN
    -- New token: insert with observed MC as the entry (only if authorized).
    v_new_entry := CASE
      WHEN p_observed_mcap IS NOT NULL AND p_observed_mcap > 0 AND v_authorized
        THEN p_observed_mcap
      ELSE NULL
    END;

    INSERT INTO public.holders_intel_seen_tokens (
      token_mint, symbol, name,
      first_seen_at, last_seen_at,
      market_cap_at_discovery, entry_mcap_usd,
      last_trigger_source, times_seen
    ) VALUES (
      p_mint, p_symbol, p_name,
      p_observed_at, v_now,
      v_new_entry, v_new_entry,
      p_source, 1
    )
    ON CONFLICT (token_mint) DO UPDATE
      SET last_seen_at = EXCLUDED.last_seen_at,
          last_trigger_source = EXCLUDED.last_trigger_source;

    RETURN QUERY SELECT v_new_entry, p_observed_at, true;
    RETURN;
  END IF;

  -- Existing token: are we still inside the discovery window?
  v_within_window := (v_now - v_existing_first) <= make_interval(mins => v_window_minutes);

  -- Always stamp last_seen + symbol/name if missing.
  UPDATE public.holders_intel_seen_tokens
     SET last_seen_at = v_now,
         last_trigger_source = p_source,
         symbol = COALESCE(symbol, p_symbol),
         name = COALESCE(name, p_name)
   WHERE token_mint = p_mint;

  -- Only adjust Entry MC down if: observed > 0, source authorized,
  -- still inside discovery window, and observed < existing (or existing null).
  IF p_observed_mcap IS NOT NULL AND p_observed_mcap > 0
     AND v_authorized AND v_within_window
     AND (v_existing_entry IS NULL OR p_observed_mcap < v_existing_entry)
  THEN
    UPDATE public.holders_intel_seen_tokens
       SET entry_mcap_usd = p_observed_mcap,
           market_cap_at_discovery = LEAST(
             COALESCE(market_cap_at_discovery, p_observed_mcap),
             p_observed_mcap
           )
     WHERE token_mint = p_mint;
    v_existing_entry := p_observed_mcap;
  END IF;

  RETURN QUERY SELECT v_existing_entry, v_existing_first, v_within_window;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_mesh_entry_mcap(text, text, text, numeric, text, timestamptz)
  TO authenticated, service_role;

-- Rebuild lock_entry_mcap so Mesh (holders_intel_seen_tokens) is the source
-- of truth and the discovery-window rule is honored. The lifecycle row is
-- synced FROM the Mesh entry, not the other way around. p_observed is only
-- considered when an explicit p_source is authorized AND we are still inside
-- the discovery window.
CREATE OR REPLACE FUNCTION public.lock_entry_mcap(
  p_mint text,
  p_observed numeric,
  p_symbol text DEFAULT NULL,
  p_source text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mesh_entry numeric;
  v_mesh_first timestamptz;
  v_within boolean;
BEGIN
  IF p_mint IS NULL OR length(p_mint) = 0 THEN
    RETURN NULL;
  END IF;

  -- Feed the observation through the Mesh upsert (respects window + source).
  IF p_observed IS NOT NULL AND p_observed > 0 AND p_source IS NOT NULL THEN
    PERFORM public.upsert_mesh_entry_mcap(
      p_mint, p_symbol, NULL, p_observed, p_source, now()
    );
  END IF;

  -- Canonical Entry MC = Mesh entry.
  SELECT entry_mcap_usd, first_seen_at
    INTO v_mesh_entry, v_mesh_first
    FROM public.holders_intel_seen_tokens
    WHERE token_mint = p_mint;

  IF v_mesh_entry IS NULL THEN
    RETURN NULL;
  END IF;

  -- Sync lifecycle row.
  INSERT INTO public.telegram_insider_token_lifecycle (
    token_mint, token_symbol, entry_market_cap,
    channel_name, first_called_at, built_at
  ) VALUES (
    p_mint, p_symbol, v_mesh_entry,
    'observed', COALESCE(v_mesh_first, now()), now()
  )
  ON CONFLICT (token_mint) DO UPDATE
    SET entry_market_cap = EXCLUDED.entry_market_cap;

  RETURN v_mesh_entry;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lock_entry_mcap(text, numeric, text, text)
  TO authenticated, service_role;