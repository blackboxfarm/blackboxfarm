INSERT INTO holders_intel_config (key, value, updated_at)
VALUES 
  ('advert_shown_x_advert_1', '32', now()),
  ('advert_shown_x_advert_2', '30', now()),
  ('advert_shown_x_advert_3', '28', now()),
  ('advert_shown_x_advert_4', '26', now()),
  ('advert_shown_tg_advert_1', '32', now()),
  ('advert_shown_tg_advert_2', '30', now()),
  ('advert_shown_tg_advert_3', '28', now())
ON CONFLICT (key) DO NOTHING;