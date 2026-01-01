-- Add token classification columns to pumpfun_discovery_logs
ALTER TABLE pumpfun_discovery_logs 
ADD COLUMN IF NOT EXISTS token_type text,
ADD COLUMN IF NOT EXISTS entry_window text,
ADD COLUMN IF NOT EXISTS current_multiplier numeric,
ADD COLUMN IF NOT EXISTS recommended_action text,
ADD COLUMN IF NOT EXISTS strategy_details jsonb,
ADD COLUMN IF NOT EXISTS classification_reasoning text[];

-- Add index for quick filtering by token type
CREATE INDEX IF NOT EXISTS idx_pumpfun_discovery_logs_token_type 
ON pumpfun_discovery_logs(token_type);

-- Add index for entry window
CREATE INDEX IF NOT EXISTS idx_pumpfun_discovery_logs_entry_window 
ON pumpfun_discovery_logs(entry_window);

-- Add index for recommended action
CREATE INDEX IF NOT EXISTS idx_pumpfun_discovery_logs_recommended_action 
ON pumpfun_discovery_logs(recommended_action);

-- Add comment explaining token classification
COMMENT ON COLUMN pumpfun_discovery_logs.token_type IS 'Token classification: quick_pump, project, or unknown';
COMMENT ON COLUMN pumpfun_discovery_logs.entry_window IS 'Entry timing: optimal, acceptable, late, or missed';
COMMENT ON COLUMN pumpfun_discovery_logs.current_multiplier IS 'Price multiplier from initial creation price';
COMMENT ON COLUMN pumpfun_discovery_logs.recommended_action IS 'Strategy action: enter_quick, enter_hold, watch, or skip';
COMMENT ON COLUMN pumpfun_discovery_logs.strategy_details IS 'Full strategy recommendation with targets and position sizing';
COMMENT ON COLUMN pumpfun_discovery_logs.classification_reasoning IS 'Array of reasons explaining the classification';