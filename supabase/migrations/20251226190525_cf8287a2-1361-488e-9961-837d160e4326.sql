-- Insert accounts from the screenshots (upsert - update if exists)
INSERT INTO public.twitter_accounts (username, display_name, verification_type, group_name, position)
VALUES 
  ('properfuctonsol', '$FUCT on SOL Official', 'blue', 'Ungrouped', 1),
  ('BaglessCoin_WTF', 'BaglessCoin_Official', 'blue', 'Ungrouped', 2),
  ('WTF_Bags', 'WTF Bags', 'none', 'Ungrouped', 3),
  ('Loot_on_Bags', '$LOOTonBags', 'none', 'Ungrouped', 4),
  ('blast2earngames', 'Blast2Earn Games', 'blue', 'Ungrouped', 5),
  ('RobinSol_staked', 'AlonBagsMe', 'none', 'Ungrouped', 6),
  ('System_Reset_', 'System Reset', 'blue', 'Ungrouped', 7),
  ('Starchild_Spa', 'StarChild Ubud Spa', 'none', 'Ungrouped', 8),
  ('CryptScamAlerts', 'Crypto Scam Alerts', 'none', 'Ungrouped', 9),
  ('CitronTribute', 'Citron', 'blue', 'Ungrouped', 10),
  ('asciipenisCTO', 'AsciiPenis', 'blue', 'Ungrouped', 11),
  ('blackbox_farm', 'BlackBox.farm', 'none', 'Ungrouped', 12),
  ('Luna_Dusk_x', 'Luna_Dusk', 'none', 'Ungrouped', 13),
  ('burnttoast_x', 'burnt_toast', 'none', 'Ungrouped', 14)
ON CONFLICT (username) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  verification_type = EXCLUDED.verification_type,
  position = EXCLUDED.position;