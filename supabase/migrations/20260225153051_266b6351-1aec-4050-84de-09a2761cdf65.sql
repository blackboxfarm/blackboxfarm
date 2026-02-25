
UPDATE dev_wallet_reputation SET
  trust_level = 'scammer',
  total_tokens_launched = 14,
  tokens_graduated = 0,
  success_rate_pct = 0,
  is_serial_spammer = true,
  reputation_score = 5,
  dev_pattern = 'narrative_derivative_farmer',
  notes = '14 pump tokens (Pippin family: Pimppin, BabyPippin, MommyPippin, DaddyPippin + 10 others). 0% graduation. Funded via 5bnadFXj from Binance. Blacklisted 2026-02-25.',
  upstream_wallets = ARRAY['5bnadFXjwtDivKsTM93999wnQFR6hF1TYqdyBFReznq2'],
  twitter_accounts = ARRAY['x.com/i/communities/2026656570138923506', 'x.com/i/communities/2026061811574022536', 'x.com/i/communities/2026011215999205578'],
  last_analyzed_at = now(),
  updated_at = now()
WHERE wallet_address = 'CRrhH1LrGmMxK9LnfQSjj7q69zHoaYANn9Ro7nPkTKwz';
