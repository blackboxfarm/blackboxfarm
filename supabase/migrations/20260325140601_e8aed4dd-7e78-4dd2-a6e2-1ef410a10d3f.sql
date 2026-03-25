
-- Step 1: Add INTEL_PUBLIC target
INSERT INTO telegram_message_targets (chat_id, label, resolved_name, user_id, target_type)
VALUES ('-1003659015482', 'INTEL_PUBLIC', 'HoldersIntel Public', '1b97e951-2f2d-46eb-a183-de7fb75c12f0', 'private');

-- Step 2: Expand the check constraint to allow tg_public_post
ALTER TABLE holders_intel_templates DROP CONSTRAINT holders_intel_templates_template_name_check;
ALTER TABLE holders_intel_templates ADD CONSTRAINT holders_intel_templates_template_name_check 
  CHECK (template_name = ANY (ARRAY['small', 'large', 'shares', 'tg_posted', 'tg_search', 'subscription', 'tg_public_post']));

-- Step 3: Insert default tg_public_post template
INSERT INTO holders_intel_templates (template_name, template_text, is_active, description)
VALUES (
  'tg_public_post',
  E'🔎 ${ticker} Holder Analysis\n\n📊 {totalWallets} Wallets → ✅ {realHolders} Real\nHealth: {healthGrade} | {dustPct}% Dust\n\n🐋 {whales} Whales | 😎 {serious} Serious\n🌱 {retail} Retail | 💨 {dust} Dust\n\n🐦 {tweetUrl}\n\n💎 Want full reports, AI summaries & whale alerts?\n👉 Subscribe for $9.99/mo: blackbox.farm/pricing',
  true,
  'Public Telegram channel post template - conversion focused, sent alongside X posts'
);
