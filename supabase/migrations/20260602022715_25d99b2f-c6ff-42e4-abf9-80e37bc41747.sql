INSERT INTO public.profile_subscription_tiers (profile_key, tier_months, price_fiat, discount_pct, is_active, sort_order)
VALUES
  ('no_lube', 1,  9.99,  0, true, 1),
  ('no_lube', 3,  26.97, 10, true, 2),
  ('no_lube', 6,  47.95, 20, true, 3),
  ('no_lube', 12, 83.92, 30, true, 4)
ON CONFLICT (profile_key, tier_months) DO UPDATE
SET price_fiat = EXCLUDED.price_fiat,
    discount_pct = EXCLUDED.discount_pct,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order;