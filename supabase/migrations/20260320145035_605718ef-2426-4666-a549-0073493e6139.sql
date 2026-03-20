-- Correct BABYCHIBI second buy to use actual purchased token delta, not cumulative wallet balance
-- Tx: 3LTdsrahakaU6aZYTxaR82EwExaD5fk8ZjwvJusTBJBPPPXxFxMnqFKaTGEqYLayJhLefAFKNP4cduEeG3VHexqf
-- On-chain delta: 9,977,408.573404 - 6,901,021.607063 = 3,076,386.966341 BABYCHIBI bought
-- Stored USD cost remains 88.65, so entry price = 88.65 / 3,076,386.966341 = 0.00002881627083

UPDATE public.flip_positions
SET
  quantity_tokens = 3076386.966341,
  original_quantity_tokens = COALESCE(original_quantity_tokens, 3076386.966341),
  buy_price_usd = 88.65 / 3076386.966341,
  target_price_usd = (88.65 / 3076386.966341) * target_multiplier,
  updated_at = now()
WHERE id = 'f0c63aa7-98a3-4a53-9a53-572366842aac';

-- REVERSAL:
-- UPDATE public.flip_positions
-- SET
--   quantity_tokens = 9977408.573404,
--   original_quantity_tokens = NULL,
--   buy_price_usd = 88.65 / 9977408.573404,
--   target_price_usd = (88.65 / 9977408.573404) * target_multiplier,
--   updated_at = now()
-- WHERE id = 'f0c63aa7-98a3-4a53-9a53-572366842aac';