-- Fix Buy 1: 0.995301884 SOL ($84.93) → 3,432,291.275239 shitcoin
UPDATE flip_positions 
SET quantity_tokens = 3432291.275239, 
    buy_price_usd = 84.93 / 3432291.275239,
    buy_amount_usd = 84.93
WHERE id = 'dff0ce93-93e0-4699-b9cc-7301f426247b';

-- Fix Buy 2: 0.997037037 SOL ($85.08) → 4,660,877.270740 shitcoin
UPDATE flip_positions 
SET quantity_tokens = 4660877.27074, 
    buy_price_usd = 85.08 / 4660877.27074,
    buy_amount_usd = 85.08
WHERE id = '0fc606b3-d343-48e1-b00b-222cb0439083';