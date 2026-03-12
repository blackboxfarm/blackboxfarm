-- Delete all reputation_mesh entries linked to the malformed "i" X account
-- This was caused by regex matching "i" from x.com/i/communities/... URLs
DELETE FROM reputation_mesh 
WHERE (linked_type = 'x_account' AND linked_id = 'i') 
   OR (source_type = 'x_account' AND source_id = 'i');

-- Also clean up any other reserved path handles that may have leaked
DELETE FROM reputation_mesh 
WHERE (linked_type = 'x_account' AND linked_id IN ('intent', 'search', 'hashtag', 'settings', 'home', 'explore', 'notifications', 'messages', 'compose', 'lists', 'bookmarks', 'communities', 'spaces'))
   OR (source_type = 'x_account' AND source_id IN ('intent', 'search', 'hashtag', 'settings', 'home', 'explore', 'notifications', 'messages', 'compose', 'lists', 'bookmarks', 'communities', 'spaces'));