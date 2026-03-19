INSERT INTO stripe_customers (stripe_customer_id, stripe_subscription_id, email, name, tier_key, is_active, amount_cents, currency, interval, current_period_end, stripe_product_id)
VALUES ('cus_UAvcBEaqBL05OT', 'sub_1TCZlcEgTpjD9EqdtKGexCCI', 'mohad222@gmail.com', 'Mohammed Awad', 'pro', true, 999, 'usd', 'month', '2026-04-18T00:00:00Z', NULL)
ON CONFLICT (stripe_customer_id) DO NOTHING;