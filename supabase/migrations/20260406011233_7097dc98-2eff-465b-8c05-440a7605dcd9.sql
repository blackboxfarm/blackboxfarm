
DELETE FROM auth.refresh_tokens 
WHERE user_id::uuid IN (
  SELECT id FROM auth.users 
  WHERE created_at >= '2026-04-04'::date 
  AND created_at < '2026-04-06'::date
);
