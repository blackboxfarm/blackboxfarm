-- Fix SHOOTER position 2da80ff5: correct quantity from 3,006,206 (total balance) to 2,180,662.559379 (actual swap amount per Solscan)
UPDATE flip_positions 
SET quantity_tokens = '2180662.559379',
    buy_price_usd = 31.573499999999996 / 2180662.559379
WHERE id = '2da80ff5-8d8a-4937-87a3-3d8d0af35ced';