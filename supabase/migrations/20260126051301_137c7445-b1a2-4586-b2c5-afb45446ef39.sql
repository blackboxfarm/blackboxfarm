-- Reset these 2 tokens to watching status so they get re-checked with mayhem verification
UPDATE pumpfun_watchlist 
SET 
  status = 'watching',
  mayhem_checked = false,
  bundle_checked = false,
  qualified_at = null,
  qualification_reason = null
WHERE token_mint IN (
  '2ufaVp2ESshKyZaPwWC5iiEsPwmnrXYj8HWGAfjjpump',
  'Fjihp6nms2kiF1S5hF4Xye9BUENmcWSmffAoc5yNpump'
);

-- Also remove from buy_candidates
DELETE FROM pumpfun_buy_candidates 
WHERE token_mint IN (
  '2ufaVp2ESshKyZaPwWC5iiEsPwmnrXYj8HWGAfjjpump',
  'Fjihp6nms2kiF1S5hF4Xye9BUENmcWSmffAoc5yNpump'
);