-- Insert KOL entries from kolscan.io leaderboard
INSERT INTO pumpfun_kol_registry (wallet_address, display_name, twitter_handle, kol_tier, source, is_active, first_seen_at, last_refreshed_at)
VALUES
  ('CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o', 'Cented', 'Cented7', 'suspected', 'manual', true, now(), now()),
  ('2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f', 'Cupsey', 'Cupseyy', 'suspected', 'manual', true, now(), now()),
  ('4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk', 'Jijo', 'jijo_exe', 'suspected', 'manual', true, now(), now()),
  ('JDd3hy3gQn2V982mi1zqhNqUw1GfV2UL6g76STojCJPN', 'West', 'ratwizardx', 'suspected', 'manual', true, now(), now()),
  ('Ez2jp3rwXUbaTx7XwiHGaWVgTPFdzJoSg8TopqbxfaJN', 'Keano', 'nftkeano', 'suspected', 'manual', true, now(), now()),
  ('5sNnKuWKUtZkdC1eFNyqz3XHpNoCRQ1D1DfHcNHMV7gn', 'cryptovillain26', 'cryptovillain26', 'suspected', 'manual', true, now(), now()),
  ('PMJA8UQDyWTFw2Smhyp9jGA6aTaP7jKHR7BPudrgyYN', 'chester', 'Chestererer', 'suspected', 'manual', true, now(), now()),
  ('3kebnKw7cPdSkLRfiMEALyZJGZ4wdiSRvmoN4rD1yPzV', 'Bastille', 'BastilleBtc', 'suspected', 'manual', true, now(), now()),
  ('G6fUXjMKPJzCY1rveAE6Qm7wy5U3vZgKDJmN1VPAdiZC', 'clukz', 'clukzSOL', 'suspected', 'manual', true, now(), now()),
  ('57rXqaQsvgyBKwebP2StfqQeCBjBS4jsrZFJN5aU2V9b', 'ram', '0xRamonos', 'suspected', 'manual', true, now(), now()),
  ('Be24Gbf5KisDk1LcWWZsBn8dvB816By7YzYF5zWZnRR6', 'Chairman ²', 'Chairman_DN', 'suspected', 'manual', true, now(), now())
ON CONFLICT (wallet_address) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  twitter_handle = EXCLUDED.twitter_handle,
  last_refreshed_at = now();