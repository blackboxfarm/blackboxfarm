-- Add initial balance configuration fields to arb_bot_config
ALTER TABLE arb_bot_config
ADD COLUMN IF NOT EXISTS initial_eth_mainnet NUMERIC NOT NULL DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS initial_eth_base NUMERIC NOT NULL DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS initial_base_tokens NUMERIC NOT NULL DEFAULT 1000.0,
ADD COLUMN IF NOT EXISTS balance_aware_mode BOOLEAN NOT NULL DEFAULT true;

-- Function to initialize virtual balances for new users
CREATE OR REPLACE FUNCTION initialize_arb_balances_for_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  config_record RECORD;
BEGIN
  -- Get the user's config
  SELECT initial_eth_mainnet, initial_eth_base, initial_base_tokens
  INTO config_record
  FROM arb_bot_config
  WHERE user_id = p_user_id;
  
  -- Create or update balances record
  INSERT INTO arb_balances (
    user_id,
    eth_mainnet,
    eth_base,
    base_token_base,
    total_value_usd,
    last_updated
  ) VALUES (
    p_user_id,
    config_record.initial_eth_mainnet,
    config_record.initial_eth_base,
    config_record.initial_base_tokens,
    0, -- Will be calculated by refresh function
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    eth_mainnet = EXCLUDED.eth_mainnet,
    eth_base = EXCLUDED.eth_base,
    base_token_base = EXCLUDED.base_token_base,
    last_updated = now();
END;
$$;

-- Trigger to auto-initialize balances when config is created
CREATE OR REPLACE FUNCTION trigger_initialize_arb_balances()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM initialize_arb_balances_for_user(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_initialize_arb_balances ON arb_bot_config;
CREATE TRIGGER auto_initialize_arb_balances
  AFTER INSERT ON arb_bot_config
  FOR EACH ROW
  EXECUTE FUNCTION trigger_initialize_arb_balances();