-- Update check constraint to allow 'subscription' template name
ALTER TABLE public.holders_intel_templates DROP CONSTRAINT holders_intel_templates_template_name_check;
ALTER TABLE public.holders_intel_templates ADD CONSTRAINT holders_intel_templates_template_name_check 
  CHECK (template_name = ANY (ARRAY['small'::text, 'large'::text, 'shares'::text, 'tg_posted'::text, 'tg_search'::text, 'subscription'::text]));

-- Insert the subscription template
INSERT INTO public.holders_intel_templates (template_name, template_text, is_active, description)
VALUES (
  'subscription',
  E'🔎 Holder Analysis: ${ticker}\n\nCA: {ca}\n\nHealth: {healthGrade} ({healthScore}/100)\n\n📊 {totalWallets} Total Wallets\n✅ {realHolders} Real Holders\n{dustPct}% are dust wallets\n\n🐋 {whales} Whales (>$1K)\n💼 {serious} Serious ($200-$1K)\n🌱 {retail} Retail ($1-$199)\n💨 {dust} Dust (<$1)\n\n🧠 AI Overview:\n{ai_overview}\n\n📈 Lifecycle: {lifecycle}\n\nFree report 👉 blackbox.farm/holders?token={ca}',
  false,
  'Template for X Subscription Community posts - detailed AI overview format'
)
ON CONFLICT DO NOTHING;