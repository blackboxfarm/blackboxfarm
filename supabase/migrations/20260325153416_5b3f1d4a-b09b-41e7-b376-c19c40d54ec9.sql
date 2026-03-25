-- Update check constraint to include advert template names
ALTER TABLE holders_intel_templates DROP CONSTRAINT holders_intel_templates_template_name_check;

ALTER TABLE holders_intel_templates ADD CONSTRAINT holders_intel_templates_template_name_check 
  CHECK (template_name = ANY (ARRAY['small'::text, 'large'::text, 'shares'::text, 'tg_posted'::text, 'tg_search'::text, 'subscription'::text, 'tg_public_post'::text, 'x_advert_1'::text, 'x_advert_2'::text, 'tg_advert_1'::text, 'tg_advert_2'::text]));

-- Insert 4 advert template rows
INSERT INTO holders_intel_templates (template_name, template_text, is_active, description) VALUES
  ('x_advert_1', '📢 SPONSORED

Check out our premium holder analysis tools!

🔍 Real-time holder tracking
📊 AI-powered insights  
🐋 Whale alerts

Try free 👉 blackbox.farm/holders

#Solana #CryptoTools', true, 'X/Twitter advert template #1'),
  ('x_advert_2', '🚀 BlackBox Farm

The #1 holder analysis tool on Solana

✅ Holder health scores
✅ Dust wallet detection
✅ Developer reputation

Start analyzing 👉 blackbox.farm

#Solana #DeFi', true, 'X/Twitter advert template #2'),
  ('tg_advert_1', '📢 *Sponsored*

🔍 Want to know who REALLY holds a token?

BlackBox Farm gives you:
• Real vs dust holder counts
• Whale tracking and alerts
• AI-powered analysis

👉 blackbox.farm/holders', true, 'Telegram advert template #1'),
  ('tg_advert_2', '🚀 *BlackBox Farm*

The number 1 holder analysis tool on Solana

✅ Health scores for any token
✅ Developer reputation checks
✅ Community momentum signals

Start free 👉 blackbox.farm', true, 'Telegram advert template #2');

-- Insert advert config rows
INSERT INTO holders_intel_config (key, value) VALUES
  ('advert_enabled', 'false'),
  ('advert_frequency', '5'),
  ('advert_post_counter', '0'),
  ('advert_last_x_template', 'x_advert_1'),
  ('advert_last_tg_template', 'tg_advert_1')
ON CONFLICT (key) DO NOTHING;