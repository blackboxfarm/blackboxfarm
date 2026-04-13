INSERT INTO public.promo_codes (code, max_uses, trial_duration_days, tier_granted, source_label, is_active)
VALUES ('ARAB10', 10, 30, 'pro', 'Arabic Channel', true)
ON CONFLICT (code) DO NOTHING;