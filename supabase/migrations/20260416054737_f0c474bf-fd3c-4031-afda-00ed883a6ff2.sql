-- Fix xBelieve Buy 2: actual on-chain = 394,203.795796 tokens for 0.979458293 SOL ($83.66)
UPDATE flip_positions 
SET quantity_tokens = 394203.795796, 
    buy_amount_sol = 0.979458293,
    buy_amount_usd = 83.66,
    buy_price_usd = 83.66 / 394203.795796
WHERE id = '54a9834e-bed6-4057-afe7-aee9e39219a0';

-- Fix xBelieve Buy 3: actual on-chain = 218,048.967206 tokens for 0.399092591 SOL ($34.08)
UPDATE flip_positions 
SET quantity_tokens = 218048.967206, 
    buy_amount_sol = 0.399092591,
    buy_amount_usd = 34.08,
    buy_price_usd = 34.08 / 218048.967206
WHERE id = 'e473d327-a65c-4d64-9884-3eb0d770e28d';

-- Fix xBelieve Buy 1: correct SOL and USD from Solscan (0.506342249 SOL / $43.24)
UPDATE flip_positions 
SET buy_amount_sol = 0.506342249,
    buy_amount_usd = 43.24,
    buy_price_usd = 43.24 / 1001495.150956
WHERE id = '3463c8aa-3565-44e6-9e3c-2895f0695ce1';