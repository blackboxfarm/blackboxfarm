-- Mark the two duplicate BUDDY positions as sold, keeping only the final consolidated one
UPDATE flip_positions SET status = 'sold', sell_price_usd = buy_price_usd WHERE id IN ('5199fc96-f4d6-44ee-9851-a4c50f5d2ad8', 'a40c85bc-cc7a-4570-9c3f-25a3c10b7223');

-- Update the remaining position with a weighted-average buy price based on the actual buys
-- Buy 1: ~1.88M tokens @ 0.00002097, Buy 2: ~2.40M tokens @ 0.00000924, Buy 3: ~0.38M tokens @ 0.00000085
-- Total cost ≈ (1879871*0.00002097) + (2397217*0.00000924) + (376655*0.00000085) ≈ 39.40 + 22.15 + 0.32 = $61.87
-- Weighted avg = 61.87 / 4653744 ≈ 0.00001330
UPDATE flip_positions SET quantity_tokens = 4653743.91, buy_price_usd = 0.00001330 WHERE id = '0acd4ac9-15cf-430e-af7f-aed6b50c1754';
