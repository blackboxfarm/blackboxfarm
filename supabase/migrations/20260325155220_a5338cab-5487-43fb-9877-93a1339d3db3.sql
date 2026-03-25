-- Update check constraint to include x_advert_3 and x_advert_4
ALTER TABLE holders_intel_templates DROP CONSTRAINT holders_intel_templates_template_name_check;
ALTER TABLE holders_intel_templates ADD CONSTRAINT holders_intel_templates_template_name_check 
  CHECK (template_name = ANY (ARRAY['small'::text, 'large'::text, 'shares'::text, 'tg_posted'::text, 'tg_search'::text, 'subscription'::text, 'tg_public_post'::text, 'x_advert_1'::text, 'x_advert_2'::text, 'x_advert_3'::text, 'x_advert_4'::text, 'tg_advert_1'::text, 'tg_advert_2'::text, 'tg_advert_3'::text]));

INSERT INTO holders_intel_templates (template_name, template_text, is_active, description) VALUES
  ('x_advert_3', '🔎 Tired of guessing who holds a token?

BlackBox Farm shows you:
✅ Real vs dust holders
🐋 Whale concentration
📊 Health grades

Free analysis 👉 blackbox.farm/holders

#Solana #CryptoAnalysis', true, 'X/Twitter advert template #3'),
  ('x_advert_4', '📊 Token Due Diligence Made Easy

Before you ape, check the holders.

🔍 Real holder count
🧠 AI risk assessment
🔮 Developer reputation

Analyze any token 👉 blackbox.farm

#Solana #DYOR', true, 'X/Twitter advert template #4');