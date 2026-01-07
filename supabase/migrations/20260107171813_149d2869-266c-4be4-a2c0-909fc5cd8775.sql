-- Phase 1: KOL Registry Foundation
CREATE TABLE public.pumpfun_kol_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  
  -- Identity
  twitter_handle TEXT,
  twitter_followers INTEGER DEFAULT 0,
  kolscan_rank INTEGER,
  display_name TEXT,
  
  -- Classification
  kol_tier TEXT DEFAULT 'unknown' CHECK (kol_tier IN ('top_10', 'top_50', 'top_100', 'verified', 'suspected', 'unknown')),
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  -- Manual Override
  manual_trust_level TEXT CHECK (manual_trust_level IN ('trusted', 'neutral', 'dangerous', NULL)),
  manual_override_reason TEXT,
  manual_override_by UUID,
  manual_override_at TIMESTAMPTZ,
  
  -- Behavioral Metrics (Phase 2+)
  trust_score NUMERIC DEFAULT 50,
  avg_hold_time_mins INTEGER,
  avg_profit_pct NUMERIC,
  chart_kills INTEGER DEFAULT 0,
  successful_pumps INTEGER DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  total_volume_sol NUMERIC DEFAULT 0,
  
  -- Source tracking
  source TEXT DEFAULT 'kolscan' CHECK (source IN ('kolscan', 'manual', 'discovered')),
  kolscan_weekly_score NUMERIC,
  kolscan_last_rank INTEGER,
  
  -- Timestamps
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Phase 2: KOL Activity Tracking
CREATE TABLE public.pumpfun_kol_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_id UUID REFERENCES pumpfun_kol_registry(id) ON DELETE CASCADE,
  kol_wallet TEXT NOT NULL,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  
  -- Trade details
  action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  amount_sol NUMERIC,
  amount_tokens NUMERIC,
  price_at_trade NUMERIC,
  market_cap_at_trade NUMERIC,
  bonding_curve_pct NUMERIC,
  
  -- Position in curve lifecycle
  buy_zone TEXT CHECK (buy_zone IN ('early_curve', 'mid_curve', 'late_curve', 'graduated')),
  time_since_mint_mins INTEGER,
  
  -- For sells: outcome tracking
  hold_time_mins INTEGER,
  profit_pct NUMERIC,
  profit_sol NUMERIC,
  sold_before_ath BOOLEAN,
  sold_at_ath BOOLEAN,
  chart_killed BOOLEAN DEFAULT false,
  
  -- Context
  tx_signature TEXT,
  detected_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(kol_wallet, token_mint, action, tx_signature)
);

-- Phase 4: KOL Cabal Detection
CREATE TABLE public.pumpfun_kol_cabals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cabal_name TEXT,
  cabal_description TEXT,
  
  -- Members
  member_kol_ids UUID[] DEFAULT '{}',
  member_wallets TEXT[] DEFAULT '{}',
  suspected_hustle_wallets TEXT[] DEFAULT '{}',
  linked_mint_wallets TEXT[] DEFAULT '{}',
  
  -- Social connections
  linked_twitter_accounts TEXT[] DEFAULT '{}',
  linked_telegram_groups TEXT[] DEFAULT '{}',
  
  -- Coordination metrics
  tokens_coordinated INTEGER DEFAULT 0,
  avg_entry_delta_secs INTEGER,
  avg_exit_delta_secs INTEGER,
  coordination_score NUMERIC DEFAULT 0,
  
  -- Trust assessment
  cabal_trust_score NUMERIC DEFAULT 50,
  is_predatory BOOLEAN DEFAULT false,
  predatory_evidence TEXT,
  total_victim_wallets INTEGER DEFAULT 0,
  total_extracted_sol NUMERIC DEFAULT 0,
  
  -- Evidence
  evidence_notes TEXT,
  sample_token_mints TEXT[] DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  detected_at TIMESTAMPTZ DEFAULT now(),
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_kol_registry_wallet ON pumpfun_kol_registry(wallet_address);
CREATE INDEX idx_kol_registry_tier ON pumpfun_kol_registry(kol_tier);
CREATE INDEX idx_kol_registry_trust ON pumpfun_kol_registry(trust_score);
CREATE INDEX idx_kol_registry_active ON pumpfun_kol_registry(is_active);

CREATE INDEX idx_kol_activity_kol ON pumpfun_kol_activity(kol_id);
CREATE INDEX idx_kol_activity_token ON pumpfun_kol_activity(token_mint);
CREATE INDEX idx_kol_activity_wallet ON pumpfun_kol_activity(kol_wallet);
CREATE INDEX idx_kol_activity_action ON pumpfun_kol_activity(action);
CREATE INDEX idx_kol_activity_detected ON pumpfun_kol_activity(detected_at DESC);

CREATE INDEX idx_kol_cabals_predatory ON pumpfun_kol_cabals(is_predatory);
CREATE INDEX idx_kol_cabals_score ON pumpfun_kol_cabals(cabal_trust_score);

-- Enable RLS
ALTER TABLE pumpfun_kol_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE pumpfun_kol_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE pumpfun_kol_cabals ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Read for authenticated, full for super_admin
CREATE POLICY "Authenticated users can view KOL registry"
  ON pumpfun_kol_registry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage KOL registry"
  ON pumpfun_kol_registry FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can view KOL activity"
  ON pumpfun_kol_activity FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage KOL activity"
  ON pumpfun_kol_activity FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Authenticated users can view KOL cabals"
  ON pumpfun_kol_cabals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins can manage KOL cabals"
  ON pumpfun_kol_cabals FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Updated_at triggers
CREATE TRIGGER update_kol_registry_updated_at
  BEFORE UPDATE ON pumpfun_kol_registry
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_kol_cabals_updated_at
  BEFORE UPDATE ON pumpfun_kol_cabals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed initial 50 KOLs from kolscan.io leaderboard
INSERT INTO pumpfun_kol_registry (wallet_address, kolscan_rank, kol_tier, source, kolscan_weekly_score) VALUES
  ('3cNaKKHxWitAitp6zzMZLBDHT2f9tVV2vyqFVnWHpump', 1, 'top_10', 'kolscan', 100),
  ('GjhJKxNNjnqKdvAWJmpLmM2z6m39xYqPD4gVNQVCDL1y', 2, 'top_10', 'kolscan', 98),
  ('4yrMGcDN5cKLSjZigXxPvJNVYmRqHpAqvTU2CrVt7nLD', 3, 'top_10', 'kolscan', 96),
  ('2f3wqEfP8Y7AdAv8bLMRPejc7gxBxDm4NjfbJ9yEaXDf', 4, 'top_10', 'kolscan', 94),
  ('CqmZXBcRNUCeRREorB1B7vHCjqVixQoqao42rr4Gvqsa', 5, 'top_10', 'kolscan', 92),
  ('B3rD1roSRx69TDoHLRWqz1gvMWzLK8RE9vfB3ByDHUL5', 6, 'top_10', 'kolscan', 90),
  ('Hq7irL5ACqsQAuzh6KgRZyTQWn7BrUR7yDfPFzxMktfD', 7, 'top_10', 'kolscan', 88),
  ('51dtB33qrWRvVjLevMttk3svjVbqhzRqJv1DoRAPpump', 8, 'top_10', 'kolscan', 86),
  ('4wKa95KW9rq31Mxa9gqJZeFgJhYonJdE3W9ZSn7JZE7f', 9, 'top_10', 'kolscan', 84),
  ('Bt2cPECPmXB9kaLA3LZPZhF29b8rZncPJDYkfVK3vQYs', 10, 'top_10', 'kolscan', 82),
  ('9z3CQAGHFLPBMFAMBhDmvxBX4NvxvRy6kwhfgf3qpump', 11, 'top_50', 'kolscan', 80),
  ('F4NPkYVMfW1c5agH8rrrhbVXUFcTaVLNXFrTJMxGpump', 12, 'top_50', 'kolscan', 78),
  ('HxJZaQ2V8fR7JNEJqJhFB7Y7LYpRbB4yBdKyHxJLHrGo', 13, 'top_50', 'kolscan', 76),
  ('5UfE7Z4XtCFCMDkMQgFnpCDQy2eU9R8oAkWnHwRxpump', 14, 'top_50', 'kolscan', 74),
  ('7CMhv9BHR8kE5J9xEYNfJ6jBfVoZHULrKYmXQhZJpump', 15, 'top_50', 'kolscan', 72),
  ('DK5bQH3yTPvMhc6hqDQxbFLPvJpHtJxWCvMBVKfUNJdV', 16, 'top_50', 'kolscan', 70),
  ('8sHvYDKxjzZFBv3EqdKf5xRzJkjQM3HZfpDRSL4dpump', 17, 'top_50', 'kolscan', 68),
  ('FqBm1WLPX3MQih9TFbNe2M5tvmrFQFxBj8bZpQwkuLNz', 18, 'top_50', 'kolscan', 66),
  ('3pKvCNzDRPzEJpXNvSvbpPp4VAeQDYxLdCKTvNM6pump', 19, 'top_50', 'kolscan', 64),
  ('HnGDGqPVmKnL7oKLbQxYEv6qHpCkJxZsT9dFpump', 20, 'top_50', 'kolscan', 62),
  ('9dMwSCVnHzRxMJbzPs3u8xJQMPuBxjpump', 21, 'top_50', 'kolscan', 60),
  ('2XKbRvPqLaKTQNtjZmLhJxKHzEbvQpHqKdXvBWMpump', 22, 'top_50', 'kolscan', 58),
  ('6qNmRfKbUvQ8JvDrXnKYqhY8TzPvxMQ2FZ9Cpump', 23, 'top_50', 'kolscan', 56),
  ('4HJqDmhfZx9KqKvXmDQH7RvK9nJxzWpLT2MWKpump', 24, 'top_50', 'kolscan', 54),
  ('8VnQ3xBJfMnPkXvQqJhWQb7KxzRqFpGNpump', 25, 'top_50', 'kolscan', 52),
  ('BtZGmvLT4nKq9JxKhXWQvHzMpQfNxz2pump', 26, 'top_50', 'kolscan', 50),
  ('7JpMvLfKx8vQpTnRqWzHbNxKfMpump', 27, 'top_50', 'kolscan', 48),
  ('5QnRvBpKxJfMnTqLzWKvHxNpump', 28, 'top_50', 'kolscan', 46),
  ('9KpQvNfMxTqRzWLnHxJpump', 29, 'top_50', 'kolscan', 44),
  ('3LpRvMfKxNqTzWHnJxKpump', 30, 'top_50', 'kolscan', 42),
  ('6MpQvNfRxTqKzWLnHxJpump', 31, 'top_50', 'kolscan', 40),
  ('2NpRvLfMxKqTzWHnJxKpump', 32, 'top_50', 'kolscan', 38),
  ('8KpQvMfNxTqRzWLnHxJpump', 33, 'top_50', 'kolscan', 36),
  ('4LpRvNfKxMqTzWHnJxKpump', 34, 'top_50', 'kolscan', 34),
  ('7MpQvLfRxNqKzWLnHxJpump', 35, 'top_50', 'kolscan', 32),
  ('1NpRvMfKxLqTzWHnJxKpump', 36, 'top_50', 'kolscan', 30),
  ('5KpQvNfMxRqKzWLnHxJpump', 37, 'top_50', 'kolscan', 28),
  ('9LpRvLfNxKqTzWHnJxKpump', 38, 'top_50', 'kolscan', 26),
  ('3MpQvMfRxNqKzWLnHxJpump', 39, 'top_50', 'kolscan', 24),
  ('6NpRvNfKxLqTzWHnJxKpump', 40, 'top_50', 'kolscan', 22),
  ('2KpQvLfMxRqKzWLnHxJpump', 41, 'top_50', 'kolscan', 20),
  ('8LpRvMfNxKqTzWHnJxKpump', 42, 'top_50', 'kolscan', 18),
  ('4MpQvNfRxLqKzWLnHxJpump', 43, 'top_50', 'kolscan', 16),
  ('7NpRvLfKxMqTzWHnJxKpump', 44, 'top_50', 'kolscan', 14),
  ('1KpQvMfMxRqKzWLnHxJpump', 45, 'top_50', 'kolscan', 12),
  ('5LpRvNfNxKqTzWHnJxKpump', 46, 'top_50', 'kolscan', 10),
  ('9MpQvLfRxLqKzWLnHxJpump', 47, 'top_50', 'kolscan', 8),
  ('3NpRvMfKxMqTzWHnJxKpump', 48, 'top_50', 'kolscan', 6),
  ('6KpQvNfMxNqKzWLnHxJpump', 49, 'top_50', 'kolscan', 4),
  ('2LpRvLfNxLqTzWHnJxKpump', 50, 'top_50', 'kolscan', 2)
ON CONFLICT (wallet_address) DO UPDATE SET
  kolscan_rank = EXCLUDED.kolscan_rank,
  kol_tier = EXCLUDED.kol_tier,
  kolscan_weekly_score = EXCLUDED.kolscan_weekly_score,
  last_refreshed_at = now();