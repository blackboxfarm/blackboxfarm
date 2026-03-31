UPDATE twitter_tg_targets 
SET handle = LOWER(REGEXP_REPLACE(handle, '^https?://(twitter\.com|x\.com)/', ''))
WHERE handle LIKE 'http%';