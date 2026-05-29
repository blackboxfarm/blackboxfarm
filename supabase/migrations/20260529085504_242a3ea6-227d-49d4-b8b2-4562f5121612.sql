ALTER TABLE public.holders_intel_templates
  DROP CONSTRAINT IF EXISTS holders_intel_templates_template_name_check;

ALTER TABLE public.holders_intel_templates
  ADD CONSTRAINT holders_intel_templates_template_name_check
  CHECK (template_name = ANY (ARRAY[
    'small','large','shares','tg_posted','tg_search','subscription','tg_public_post',
    'x_advert_1','x_advert_2','x_advert_3','x_advert_4',
    'tg_advert_1','tg_advert_2','tg_advert_3',
    'no_lube','no_lube_public','no_lube_private','no_lube_snapshot_private'
  ]));

INSERT INTO public.holders_intel_templates (template_name, template_text)
VALUES ('no_lube_snapshot_private', E'⚡ *{ticker} Quick Stats*\n\n👥 Holders: *{totalHolders}*\n❤️ Health: *{healthScore}/100*\n🏦 Top 10%: *{top10}*\n\n📈 *Wallet Distribution*\n{walletDistBlock}\n\n🚨 *Intel Alerts*\n{intelAlert1}\n\n💰 *Market*\nMC: *{mc}* ({mcChange})  VOL: *{vol24h}*\nEntry: *{mcEntry}*  Age: *{age}*\n\n🔗 [Full Report]({intelUrl}) | [BubbleMap]({bubbleMapUrl})\n\nCA: `{ca}`')
ON CONFLICT (template_name) DO NOTHING;