
-- 1. Channel profiles table
CREATE TABLE IF NOT EXISTS public.no_lube_channel_profiles (
  kind text PRIMARY KEY CHECK (kind IN ('public','private')),
  telegram_chat_id text,
  telegram_chat_title text,
  telegram_chat_username text,
  x_handle text,
  instagram_handle text,
  tiktok_handle text,
  language text NOT NULL DEFAULT 'en',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.no_lube_channel_profiles TO authenticated;
GRANT ALL ON public.no_lube_channel_profiles TO service_role;

ALTER TABLE public.no_lube_channel_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super admins read no_lube channel profiles"
  ON public.no_lube_channel_profiles FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins insert no_lube channel profiles"
  ON public.no_lube_channel_profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins update no_lube channel profiles"
  ON public.no_lube_channel_profiles FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()));
CREATE POLICY "super admins delete no_lube channel profiles"
  ON public.no_lube_channel_profiles FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

INSERT INTO public.no_lube_channel_profiles (kind, language)
VALUES ('public','en'), ('private','en')
ON CONFLICT (kind) DO NOTHING;

-- 2. Extend template_name CHECK constraint to permit no_lube variants
ALTER TABLE public.holders_intel_templates
  DROP CONSTRAINT IF EXISTS holders_intel_templates_template_name_check;
ALTER TABLE public.holders_intel_templates
  ADD CONSTRAINT holders_intel_templates_template_name_check
  CHECK (template_name = ANY (ARRAY[
    'small','large','shares','tg_posted','tg_search','subscription','tg_public_post',
    'x_advert_1','x_advert_2','x_advert_3','x_advert_4',
    'tg_advert_1','tg_advert_2','tg_advert_3',
    'no_lube','no_lube_public','no_lube_private'
  ]));

-- 3. Seed default no_lube rows if missing (identical body so user edits diverge them)
INSERT INTO public.holders_intel_templates (template_name, template_text, is_active, description)
SELECT v.template_name, v.template_text, false, v.description
FROM (VALUES
  ('no_lube',         E'🐸 *${ticker}*\n\n━━━━━━━━━━━━\n\n🟢 Momentum: {momentum}\n🟡 Risk: {risk}\n⚡ Verdict: {verdict}\n\n💰 *Market*\nMC: {mc} ({mcChange})\nVOL: {vol24h}\nLP: {lp}\nAge: {age}\n\n🧠 *Holder Health*\nTop 10: {top10}\nFresh Wallets: {freshWallets}\nWallet Spread: {walletSpread}\nBundled Risk: {bundledRisk}', 'No Lube — Default / Master template'),
  ('no_lube_public',  E'🐸 *${ticker}*\n\n━━━━━━━━━━━━\n\n🟢 Momentum: {momentum}\n🟡 Risk: {risk}\n⚡ Verdict: {verdict}\n\n💰 *Market*\nMC: {mc} ({mcChange})\nVOL: {vol24h}\nLP: {lp}\nAge: {age}\n\n🧠 *Holder Health*\nTop 10: {top10}\nFresh Wallets: {freshWallets}\nWallet Spread: {walletSpread}\nBundled Risk: {bundledRisk}', 'No Lube — Public channel template'),
  ('no_lube_private', E'🐸 *${ticker}*\n\n━━━━━━━━━━━━\n\n🟢 Momentum: {momentum}\n🟡 Risk: {risk}\n⚡ Verdict: {verdict}\n\n💰 *Market*\nMC: {mc} ({mcChange})\nVOL: {vol24h}\nLP: {lp}\nAge: {age}\n\n🧠 *Holder Health*\nTop 10: {top10}\nFresh Wallets: {freshWallets}\nWallet Spread: {walletSpread}\nBundled Risk: {bundledRisk}', 'No Lube — Private channel template')
) AS v(template_name, template_text, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.holders_intel_templates t WHERE t.template_name = v.template_name
);
