-- ETH/Base Arbitrage Bot Database Schema

-- Configuration table for bot settings
CREATE TABLE IF NOT EXISTS arb_bot_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  
  -- Profit thresholds
  min_profit_bps integer NOT NULL DEFAULT 50, -- 0.5%
  max_slippage_bps_per_hop integer NOT NULL DEFAULT 100, -- 1%
  max_bridge_fee_pct numeric NOT NULL DEFAULT 2.0, -- 2%
  max_price_impact_bps integer NOT NULL DEFAULT 200, -- 2%
  
  -- Gas limits
  max_gas_per_tx_eth numeric NOT NULL DEFAULT 0.01,
  max_gas_per_tx_base numeric NOT NULL DEFAULT 0.001,
  
  -- Trade sizing
  trade_size_mode text NOT NULL DEFAULT 'fixed' CHECK (trade_size_mode IN ('fixed', 'percentage_balance')),
  trade_size_fixed_eth numeric NOT NULL DEFAULT 0.1,
  trade_size_pct_balance numeric NOT NULL DEFAULT 10.0,
  
  -- Operational settings
  polling_interval_sec integer NOT NULL DEFAULT 10,
  stale_quote_timeout_sec integer NOT NULL DEFAULT 30,
  rebalance_mode boolean NOT NULL DEFAULT false,
  
  -- Safety limits
  max_loss_per_trade_eth numeric NOT NULL DEFAULT 0.05,
  max_daily_loss_eth numeric NOT NULL DEFAULT 0.5,
  max_daily_trades integer NOT NULL DEFAULT 50,
  max_open_loops integer NOT NULL DEFAULT 1,
  
  -- Control flags
  auto_trade_enabled boolean NOT NULL DEFAULT false,
  dry_run_enabled boolean NOT NULL DEFAULT true,
  circuit_breaker_active boolean NOT NULL DEFAULT false,
  
  -- Enabled loops
  enable_loop_a boolean NOT NULL DEFAULT true, -- ETH(mainnet) → ETH(Base) → BASE → ETH(Base) → ETH(mainnet)
  enable_loop_b boolean NOT NULL DEFAULT true, -- ETH(Base) → BASE → ETH(Base)
  enable_loop_c boolean NOT NULL DEFAULT false, -- ETH(mainnet) → ETH(Base) → ETH(mainnet)
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE arb_bot_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own arb config"
  ON arb_bot_config
  FOR ALL
  USING (auth.uid() = user_id);

-- Balances tracking
CREATE TABLE IF NOT EXISTS arb_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  
  -- Balances
  eth_mainnet numeric NOT NULL DEFAULT 0,
  eth_base numeric NOT NULL DEFAULT 0,
  base_token_base numeric NOT NULL DEFAULT 0,
  
  -- USD values (for tracking)
  total_value_usd numeric NOT NULL DEFAULT 0,
  
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE arb_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own balances"
  ON arb_balances
  FOR ALL
  USING (auth.uid() = user_id);

-- Price snapshots
CREATE TABLE IF NOT EXISTS arb_price_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Prices in USD
  eth_mainnet_usd numeric NOT NULL,
  eth_base_usd numeric NOT NULL,
  base_token_usd numeric NOT NULL,
  base_token_eth numeric NOT NULL,
  
  -- Bridge fees
  bridge_fee_eth_to_base numeric,
  bridge_fee_base_to_eth numeric,
  
  -- Gas prices
  gas_price_eth_gwei numeric,
  gas_price_base_gwei numeric,
  
  timestamp timestamptz DEFAULT now()
);

CREATE INDEX idx_arb_prices_timestamp ON arb_price_snapshots(timestamp DESC);

-- Opportunities detected
CREATE TABLE IF NOT EXISTS arb_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  
  loop_type text NOT NULL CHECK (loop_type IN ('LOOP_A', 'LOOP_B', 'LOOP_C')),
  
  -- Trade details
  trade_size_eth numeric NOT NULL,
  expected_profit_eth numeric NOT NULL,
  expected_profit_bps integer NOT NULL,
  expected_final_eth numeric NOT NULL,
  
  -- Breakdown
  leg_breakdown jsonb NOT NULL, -- Array of legs with amounts, fees, gas
  
  -- Constraints check
  meets_profit_threshold boolean NOT NULL,
  meets_slippage_threshold boolean NOT NULL,
  meets_gas_limits boolean NOT NULL,
  meets_liquidity_depth boolean NOT NULL,
  
  executable boolean NOT NULL,
  skip_reason text,
  
  detected_at timestamptz DEFAULT now()
);

CREATE INDEX idx_arb_opps_user_time ON arb_opportunities(user_id, detected_at DESC);
CREATE INDEX idx_arb_opps_executable ON arb_opportunities(executable, expected_profit_bps DESC) WHERE executable = true;

ALTER TABLE arb_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own opportunities"
  ON arb_opportunities
  FOR ALL
  USING (auth.uid() = user_id);

-- Loop executions
CREATE TABLE IF NOT EXISTS arb_loop_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id text UNIQUE NOT NULL, -- timestamp + UUID for idempotency
  user_id uuid NOT NULL,
  
  loop_type text NOT NULL CHECK (loop_type IN ('LOOP_A', 'LOOP_B', 'LOOP_C')),
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'stranded')),
  
  -- Amounts
  starting_amount_eth numeric NOT NULL,
  final_amount_eth numeric,
  realized_profit_eth numeric,
  realized_profit_bps integer,
  
  -- Execution details
  legs jsonb NOT NULL, -- Array of executed legs with tx hashes, amounts, fees
  total_gas_spent_eth numeric,
  total_bridge_fees_eth numeric,
  total_swap_fees_eth numeric,
  
  -- Timing
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  
  -- Failure info
  error_message text,
  stranded_asset text,
  stranded_amount numeric,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_arb_loops_user_time ON arb_loop_executions(user_id, started_at DESC);
CREATE INDEX idx_arb_loops_status ON arb_loop_executions(status);

ALTER TABLE arb_loop_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own loop executions"
  ON arb_loop_executions
  FOR ALL
  USING (auth.uid() = user_id);

-- Daily stats
CREATE TABLE IF NOT EXISTS arb_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  
  total_loops_executed integer NOT NULL DEFAULT 0,
  successful_loops integer NOT NULL DEFAULT 0,
  failed_loops integer NOT NULL DEFAULT 0,
  
  total_profit_eth numeric NOT NULL DEFAULT 0,
  total_loss_eth numeric NOT NULL DEFAULT 0,
  net_pnl_eth numeric NOT NULL DEFAULT 0,
  
  total_gas_spent_eth numeric NOT NULL DEFAULT 0,
  total_volume_eth numeric NOT NULL DEFAULT 0,
  
  UNIQUE(user_id, date)
);

ALTER TABLE arb_daily_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own daily stats"
  ON arb_daily_stats
  FOR ALL
  USING (auth.uid() = user_id);

-- System health log
CREATE TABLE IF NOT EXISTS arb_system_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- RPC health
  eth_rpc_latency_ms numeric,
  base_rpc_latency_ms numeric,
  eth_rpc_error_rate numeric,
  base_rpc_error_rate numeric,
  
  -- API health
  swap_api_latency_ms numeric,
  swap_api_error_rate numeric,
  bridge_api_latency_ms numeric,
  
  -- Overall status
  status text NOT NULL CHECK (status IN ('healthy', 'degraded', 'down', 'safe_mode')),
  
  timestamp timestamptz DEFAULT now()
);

CREATE INDEX idx_arb_health_timestamp ON arb_system_health(timestamp DESC);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_arb_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER arb_config_updated_at
  BEFORE UPDATE ON arb_bot_config
  FOR EACH ROW
  EXECUTE FUNCTION update_arb_config_updated_at();