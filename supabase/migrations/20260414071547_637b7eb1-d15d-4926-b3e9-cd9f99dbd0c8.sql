
-- Delete duplicate re-uploads (these have NULL published_at, originals already have dates set)
-- "The Difference Between Real Volume and Fake Volume" - duplicate
DELETE FROM intel_briefings WHERE id = 'aaa432d8-01d3-4bc2-9a7f-48abb75b5652';
-- "The Truth About 1000+ Holders Tokens" - duplicate
DELETE FROM intel_briefings WHERE id = 'cb48c7ae-d293-40d7-a97e-c80267d31165';
-- "What Is a Bubble Map and Why It Matters in Crypto" - duplicate
DELETE FROM intel_briefings WHERE id = '2adda397-9bfa-4915-afc0-19d54329afd1';
-- "What Is Holder Distribution..." (slug without 2) - duplicate
DELETE FROM intel_briefings WHERE id = 'f77b2ccf-23a1-420f-9450-c377feabdc9d';
-- "What Is Holder Distribution..." (slug with 2) - duplicate
DELETE FROM intel_briefings WHERE id = 'dc798b16-a645-4f9c-8cf2-cce24071219c';
-- "Who Really Holds That Token?" - duplicate
DELETE FROM intel_briefings WHERE id = 'acb3da3d-7fe7-4f9c-8e24-df1940641101';
-- "Why Most Crypto Traders Lose Money" - duplicate
DELETE FROM intel_briefings WHERE id = 'af282968-fce0-4d28-99a9-c29091815168';
-- "Why Liquidity Alone Doesn't Make a Token Safe" - duplicate (different slug)
DELETE FROM intel_briefings WHERE id = '41c76a5c-202d-45f4-91fa-37172a3921b3';
-- "What Is a Crypto Wallet Analysis Tool" - duplicate
DELETE FROM intel_briefings WHERE id = 'd9ae463e-d9e4-4cc9-a3ec-c7c8431c3ef9';
-- "What Is a Crypto Bubble Map? How BlackBox Farm's..." - duplicate  
DELETE FROM intel_briefings WHERE id = '497ae37f-3bbf-4fcd-8dff-f316450e9069';
-- "Token → Dev → Funder → KYC Root" - duplicate
DELETE FROM intel_briefings WHERE id = 'bf4f5d64-d73d-45a6-81df-38510779d627';

-- Fix the remaining articles that have different IDs/slugs from re-uploads
-- "The Best Telegram Bot..." has slightly different slug  
UPDATE intel_briefings SET published_at = '2026-05-06 10:00:00+00', is_published = false WHERE id = '6883511c-7d5d-480f-bbfe-0844e1027f59';
-- "Why Traders Are Adding @holdersintel_bot..." has different slug
UPDATE intel_briefings SET published_at = '2026-05-27 10:00:00+00', is_published = false WHERE id = 'd710b712-03d1-4ec4-b0b5-1e5c46c9e98e';

-- Now fix the ones that succeeded with old IDs but there's also a "Who Really Holds" article from Apr 1 with different slug
-- Check: the article 'who-really-holds-that-token-questions-every-solana-trader-should-ask-first' published Apr 1 is a third variant
-- It needs to be kept as article #8 (Dec 24) 
UPDATE intel_briefings SET published_at = '2025-12-24 10:00:00+00', is_published = true WHERE slug = 'who-really-holds-that-token-questions-every-solana-trader-should-ask-first';

-- Also the original IDs that DID match need their Nov dates — check which are still missing
-- #1 Why Most Crypto Traders - was id 18c8abdd... 
UPDATE intel_briefings SET published_at = '2025-11-05 10:00:00+00', is_published = true WHERE id = '18c8abdd-7f09-4d8a-a3d7-5e7c6a8c9bf6';
-- #2 Truth About 1000+ Holders
UPDATE intel_briefings SET published_at = '2025-11-12 10:00:00+00', is_published = true WHERE id = '16f77360-35f8-4c83-aded-0ecc5e17e5e1';
-- #3 Difference Between Real Volume
UPDATE intel_briefings SET published_at = '2025-11-19 10:00:00+00', is_published = true WHERE id = 'c8ffc5e1-61f2-470b-8ebc-7bce4e8f9f35';
-- #4 Why Liquidity Alone
UPDATE intel_briefings SET published_at = '2025-11-26 10:00:00+00', is_published = true WHERE id = '54c2c5aa-f32a-456e-8b8f-d37ed4bc91e9';
-- #7 What Is Holder Distribution
UPDATE intel_briefings SET published_at = '2025-12-17 10:00:00+00', is_published = true WHERE id = 'd20b7b2e-2c0f-4f5a-bfcf-dd0e7e44a79b';
-- #8 Who Really Holds That Token (original)
UPDATE intel_briefings SET published_at = '2025-12-24 10:00:00+00', is_published = true WHERE id = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
-- #10 What Is a Bubble Map
UPDATE intel_briefings SET published_at = '2026-01-14 10:00:00+00', is_published = true WHERE id = '7e1e18c2-55c5-47c8-a3c2-ab5e09a6b41e';
-- #13 What Is a Crypto Wallet Analysis Tool
UPDATE intel_briefings SET published_at = '2026-02-04 10:00:00+00', is_published = true WHERE id = '3e9d6a47-5f23-49cd-a7e4-3d2a5e46f3c7';
-- #16 What Is a Crypto Bubble Map
UPDATE intel_briefings SET published_at = '2026-02-25 10:00:00+00', is_published = true WHERE id = 'e3f1d00c-cb22-469b-9cd8-0e2c36e40bf3';
-- #22 Token → Dev → Funder → KYC Root
UPDATE intel_briefings SET published_at = '2026-04-08 10:00:00+00', is_published = true WHERE id = '9b2e3870-dfe2-4d3d-8b5f-67c821b3f0f5';
-- #27 Why Traders Are Adding
UPDATE intel_briefings SET published_at = '2026-05-27 10:00:00+00', is_published = false WHERE id = '99a3dbb3-daa6-4b98-8e5c-65edba08c600';
-- #26 Best Telegram Bot
UPDATE intel_briefings SET published_at = '2026-05-06 10:00:00+00', is_published = false WHERE id = '6883511c-7d5d-480f-bbfe-2c1a6e414aa5';
