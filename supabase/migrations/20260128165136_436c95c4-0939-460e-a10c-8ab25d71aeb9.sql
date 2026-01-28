-- Fix Julius token positions with incorrect raw token quantities
-- The quantity_tokens column stored raw base units instead of human-readable amounts
-- Pump.fun tokens are always 6 decimals

UPDATE flip_positions 
SET 
  quantity_tokens_raw = quantity_tokens::text,
  quantity_tokens = quantity_tokens / 1000000.0,
  token_decimals = 6,
  buy_price_usd = buy_amount_usd / (quantity_tokens / 1000000.0)
WHERE id = '0618a09f-2363-47a4-a1ae-d12d1fe671d7';

UPDATE flip_positions 
SET 
  quantity_tokens_raw = quantity_tokens::text,
  quantity_tokens = quantity_tokens / 1000000.0,
  token_decimals = 6,
  buy_price_usd = buy_amount_usd / (quantity_tokens / 1000000.0)
WHERE id = '5c30c1d1-7ad5-461d-b72d-134967119c3a';