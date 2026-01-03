
-- Prune fantasy positions based on age and performance rules:
-- Under 12 hours: keep all (can be dipping)
-- Over 12 hours: only keep if multiplier >= 0.5x, otherwise mark as sold

UPDATE telegram_fantasy_positions
SET 
  status = 'sold',
  updated_at = NOW(),
  sold_at = NOW()
WHERE 
  status = 'open'
  AND created_at < NOW() - INTERVAL '12 hours'
  AND (
    current_price_usd IS NULL 
    OR entry_price_usd IS NULL 
    OR entry_price_usd = 0
    OR (current_price_usd / entry_price_usd) < 0.5
  );
