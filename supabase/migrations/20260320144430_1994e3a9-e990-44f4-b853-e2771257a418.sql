-- Fix latest BABYCHIBI buy (ebf68d34) to match Solscan tx wVfnY2utcPZ82d33B5PKz9Py5THTS8j1tk2SWQs6aH59BTB1RefLT9KCTndZkppyMRiJcHzsbM88Q4cLZdRZnS
-- Solscan: Swap 1.012500011 SOL ($90.59) for 3,232,897.775985 BABYCHIBI on Pump.fun

UPDATE public.flip_positions
SET
  buy_amount_sol = 1.012500011,
  buy_amount_usd = 90.59,
  quantity_tokens = 3232897.775985,
  buy_price_usd = 90.59 / 3232897.775985,
  target_price_usd = (90.59 / 3232897.775985) * target_multiplier,
  updated_at = now()
WHERE id = 'ebf68d34-8d0e-465e-9334-742b6c546178';

-- Revert f0c63aa7 back to original values (previous fix applied wrong tx data to it)
UPDATE public.flip_positions
SET
  buy_amount_sol = 1,
  buy_amount_usd = 88.65,
  quantity_tokens = 9977408.573404,
  buy_price_usd = 88.65 / 9977408.573404,
  target_price_usd = (88.65 / 9977408.573404) * target_multiplier,
  updated_at = now()
WHERE id = 'f0c63aa7-98a3-4a53-9a53-572366842aac';

-- REVERSAL:
-- UPDATE public.flip_positions SET buy_amount_sol = 1, buy_amount_usd = 89.45, quantity_tokens = 13210306.349389, buy_price_usd = 0.00000677122828450812, target_price_usd = 0.000677122828450812, updated_at = now() WHERE id = 'ebf68d34-8d0e-465e-9334-742b6c546178';
-- UPDATE public.flip_positions SET buy_amount_sol = 1.012500009, buy_amount_usd = 89.94, quantity_tokens = 3076386.966341, buy_price_usd = 0.000029235593891158964975, target_price_usd = 0.002923559389115896497500, updated_at = now() WHERE id = 'f0c63aa7-98a3-4a53-9a53-572366842aac';