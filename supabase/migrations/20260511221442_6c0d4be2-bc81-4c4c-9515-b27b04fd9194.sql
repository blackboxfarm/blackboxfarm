DO $$
DECLARE
  infra TEXT[] := ARRAY[
    'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM',
    '2oCXSSTk2XcF4xFfjxJZjDu66c18MfzkMb8woem6K4rc',
    'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM',
    'FWymgf7GwMXczUmqQ6jeeE4MukdZNuaRom4twz3U45nz',
    '7sA5em1nTKmLvGm8H85cpgA9hM9YvCoPp729mwe6akhh',
    'HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC',
    '7naFFwuEJWeWwWYQUkgAWHsxYKg3KctEuUj42JdAMidP'
  ];
BEGIN
  UPDATE pumpfun_watchlist SET creator_wallet = NULL WHERE creator_wallet = ANY(infra);
  UPDATE scraped_tokens    SET creator_wallet = NULL WHERE creator_wallet = ANY(infra);
  UPDATE token_lifecycle   SET creator_wallet = NULL WHERE creator_wallet = ANY(infra);
  DELETE FROM developer_tokens   WHERE creator_wallet = ANY(infra);
  DELETE FROM developer_profiles WHERE master_wallet_address = ANY(infra);
END $$;

REFRESH MATERIALIZED VIEW CONCURRENTLY master_token_directory;