-- Fix miscalculated BABYCHIBI position to match Solscan on-chain data
-- Tx: 3LTdsrahakaU6aZYTxaR82EwExaD5fk8ZjwvJusTBJBPPPXxFxMnqFKaTGEqYLayJhLefAFKNP4cduEeG3VHexqf
-- Solscan: Swap 1.012500009 SOL ($89.94) for 3,076,386.966341 BABYCHIBI

UPDATE public.flip_positions
SET
  buy_amount_sol = 1.012500009,
  buy_amount_usd = 89.94,
  quantity_tokens = 3076386.966341,
  buy_price_usd = 89.94 / 3076386.966341,
  target_price_usd = (89.94 / 3076386.966341) * target_multiplier,
  updated_at = now()
WHERE id = 'f0c63aa7-98a3-4a53-9a53-572366842aac';

-- REVERSAL:
-- UPDATE public.flip_positions SET buy_amount_sol = 1, buy_amount_usd = 88.65, quantity_tokens = 9977408.573404, buy_price_usd = 0.000008885072646649693, target_price_usd = 0.0008885072646649693, updated_at = now() WHERE id = 'f0c63aa7-98a3-4a53-9a53-572366842aac';