-- Insert all channels/groups extracted from screenshots
-- All are private groups/channels (numeric IDs) → use MTProto → type = 'group'
-- Settings: max_mint_age_minutes = 10080, scan_window_minutes = 1440, koth_enabled = true, first_enabled = true

INSERT INTO telegram_channel_config (user_id, channel_id, channel_name, channel_username, channel_type, is_active, fantasy_mode, max_mint_age_minutes, scan_window_minutes, koth_enabled, first_enabled, trading_mode)
VALUES
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002486747312', '$WHALE JAN 8', '-1002486747312', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002356584134', 'Degen Army', '-1002356584134', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002621285593', 'PRINTING MACHINE', '-1002621285593', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-4753645742', '100X CALLS!', '-4753645742', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002253989493', 'The Trenches 24/7', '-1002253989493', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002532648372', 'Yudag Calls Chat', '-1002532648372', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002976998329', 'Solana Pumping Party', '-1002976998329', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1003282110418', 'Iceds House of Degeneracy', '-1003282110418', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1003440986218', 'Molly Memes', '-1003440986218', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002834749614', 'Unknown Channel', '-1002834749614', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1003508232428', 'Dark Disciple Prophecy', '-1003508232428', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002231496101', 'Arab House', '-1002231496101', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1001819368322', 'Chinese Pump Capital', '-1001819368322', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1001502458504', 'Nofeline Cooks', '-1001502458504', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1003463051818', 'Crypto Gem', '-1003463051818', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1001295304117', 'Gakes Bakes', '-1001295304117', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002040892468', 'APES by DEG APE', '-1002040892468', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002141007772', 'meme SOL riders', '-1002141007772', 'group', true, true, 10080, 1440, true, true, 'simple'),
  ('909902df-b7ea-4b16-9ebb-04bb58aa6c81', '-1002199322461', 'INSIDER WALLET TRACKING', '-1002199322461', 'group', true, true, 10080, 1440, true, true, 'simple');