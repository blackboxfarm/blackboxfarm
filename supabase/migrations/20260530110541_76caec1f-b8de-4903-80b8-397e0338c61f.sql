
ALTER TABLE public.no_lube_global_profile
  ADD COLUMN IF NOT EXISTS leaks_min_mcap numeric NOT NULL DEFAULT 75000;

ALTER TABLE public.holders_intel_templates
  DROP CONSTRAINT IF EXISTS holders_intel_templates_template_name_check;

ALTER TABLE public.holders_intel_templates
  ADD CONSTRAINT holders_intel_templates_template_name_check
  CHECK (template_name = ANY (ARRAY[
    'small','large','shares','tg_posted','tg_search','subscription',
    'tg_public_post','x_advert_1','x_advert_2','x_advert_3','x_advert_4',
    'tg_advert_1','tg_advert_2','tg_advert_3',
    'no_lube','no_lube_public','no_lube_private','no_lube_snapshot_private',
    'no_lube_leaks_public'
  ]));

INSERT INTO public.holders_intel_templates (template_name, template_text)
VALUES (
  'no_lube_leaks_public',
$$💧 *LEAK* — {ticker}
_Spotted by Insiders · early signal_

👥 Holders: *{totalHolders}*
❤️ Health: *{healthScore}/100*
🏦 Top 10%: *{top10}*

💰 *Market*
MC: *{mc}* ({mcChange})  VOL: *{vol24h}*
Entry: *{mcEntry}*  Age: *{age}*

🔗 [Chart]({chartUrl}) · [BubbleMap]({bubbleMapUrl}) · [Buy]({buyUrl})

CA: `{ca}`$$
)
ON CONFLICT (template_name) DO NOTHING;
