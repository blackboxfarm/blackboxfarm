UPDATE flip_positions 
SET 
  quantity_tokens = 6365340.022874,
  buy_price_usd = 84.31 / 6365340.022874,
  entry_verified = true,
  entry_verified_at = now()
WHERE id = '3d0f3122-0496-4283-ac30-a00a2d74687d';

-- Also mark TX1 as verified since it was correct
UPDATE flip_positions 
SET 
  entry_verified = true,
  entry_verified_at = now()
WHERE id = 'e6bda466-f463-4e47-879c-4c27b98e15b4';