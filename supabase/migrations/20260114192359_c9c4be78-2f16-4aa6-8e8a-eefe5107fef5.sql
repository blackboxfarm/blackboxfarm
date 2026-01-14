-- Fix existing positions with raw token values (divide by 10^6 for 6-decimal tokens)
UPDATE flip_positions 
SET quantity_tokens = quantity_tokens / 1000000,
    original_quantity_tokens = CASE WHEN original_quantity_tokens > 1000000000 THEN original_quantity_tokens / 1000000 ELSE original_quantity_tokens END
WHERE status = 'holding' 
AND quantity_tokens > 1000000000;