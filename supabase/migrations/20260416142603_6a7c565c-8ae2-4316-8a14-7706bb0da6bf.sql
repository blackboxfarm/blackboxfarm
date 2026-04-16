
-- Clear old seeded URLs and insert the 3 new DexScreener URLs
DELETE FROM dex_scrape_sources;

INSERT INTO dex_scrape_sources (url, label, sort_order, is_active, is_page2, wait_ms)
VALUES
  ('https://dexscreener.com/new-pairs/solana?rankBy=trendingScoreH6&order=desc&minLiq=1000&maxAge=24&profile=1', 'Solana New Pairs Page 1', 1, true, false, '{3000,5000,8000}'),
  ('https://dexscreener.com/new-pairs/page-2?maxAge=24&minLiq=1000&order=desc&profile=1&rankBy=trendingScoreH6', 'Solana New Pairs Page 2', 2, true, true, '{10000,15000,20000}'),
  ('https://dexscreener.com/new-pairs/page-3?maxAge=24&minLiq=1000&order=desc&profile=1&rankBy=trendingScoreH6', 'Solana New Pairs Page 3', 3, true, true, '{10000,15000,20000}');
