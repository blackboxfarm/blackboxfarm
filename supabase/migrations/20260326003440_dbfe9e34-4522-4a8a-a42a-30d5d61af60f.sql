DELETE FROM holders_intel_post_queue
WHERE id IN (
  SELECT id FROM (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY token_mint ORDER BY created_at DESC) as rn
    FROM holders_intel_post_queue
    WHERE status = 'pending'
  ) ranked
  WHERE rn > 1
);

DELETE FROM holders_intel_post_queue
WHERE status = 'pending'
  AND token_mint IN (
    SELECT DISTINCT token_mint 
    FROM holders_intel_post_queue 
    WHERE status = 'posted'
  );