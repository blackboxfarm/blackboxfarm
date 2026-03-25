-- Update check constraint to include tg_advert_3
ALTER TABLE holders_intel_templates DROP CONSTRAINT holders_intel_templates_template_name_check;
ALTER TABLE holders_intel_templates ADD CONSTRAINT holders_intel_templates_template_name_check 
  CHECK (template_name = ANY (ARRAY['small'::text, 'large'::text, 'shares'::text, 'tg_posted'::text, 'tg_search'::text, 'subscription'::text, 'tg_public_post'::text, 'x_advert_1'::text, 'x_advert_2'::text, 'tg_advert_1'::text, 'tg_advert_2'::text, 'tg_advert_3'::text]));

INSERT INTO holders_intel_templates (template_name, template_text, is_active, description) VALUES
  ('tg_advert_3', '💎 *Premium Holder Intelligence*

Stop guessing. Start analyzing.

📊 Health scores for any Solana token
🐋 Whale movement alerts
🧠 AI-powered holder insights
🔮 Developer reputation checks

Join the smart money 👉 blackbox.farm', true, 'Telegram advert template #3');