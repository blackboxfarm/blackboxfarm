
-- Fix SHITCOIN position quantities to match on-chain total of 8,093,168.545979
-- Split proportionally by buy amount ($85.28 and $85.33)

-- Buy 1: 85.28/170.61 * 8093168.545979 = 4,045,350.97
UPDATE flip_positions 
SET quantity_tokens = 4045350.97, 
    buy_price_usd = 85.28 / 4045350.97
WHERE id = 'dff0ce93-93e0-4699-b9cc-7301f426247b';

-- Buy 2: 85.33/170.61 * 8093168.545979 = 4,047,817.58
UPDATE flip_positions 
SET quantity_tokens = 4047817.58, 
    buy_price_usd = 85.33 / 4047817.58
WHERE id = '0fc606b3-d343-48e1-b00b-222cb0439083';
