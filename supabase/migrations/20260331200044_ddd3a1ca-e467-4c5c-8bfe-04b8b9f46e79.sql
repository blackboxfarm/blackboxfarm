-- Clean up twitter_tg_targets handles from full URLs to bare handles
DO $$
BEGIN
  UPDATE twitter_tg_targets 
  SET handle = LOWER(REGEXP_REPLACE(handle, '^https?://(twitter\.com|x\.com)/', ''))
  WHERE handle LIKE 'http%';
END $$;