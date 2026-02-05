-- Drop the existing check constraint and add a new one that includes tg_posted and tg_search
ALTER TABLE public.holders_intel_templates 
DROP CONSTRAINT IF EXISTS holders_intel_templates_template_name_check;

ALTER TABLE public.holders_intel_templates 
ADD CONSTRAINT holders_intel_templates_template_name_check 
CHECK (template_name IN ('small', 'large', 'shares', 'tg_posted', 'tg_search'));

-- Now insert the new templates
INSERT INTO public.holders_intel_templates (template_name, template_text, is_active, description)
VALUES 
  ('tg_posted', '📢 *Intel XBot Posted*

🪙 *${ticker}*
├ Holders: {totalWallets}
├ Real: {realHolders}
├ Grade: {healthGrade}
└ Post #{timesPosted}

📈 Distribution
`Whales  {whaleBar} {whalePct}%`
`Serious {seriousBar} {seriousPct}%`
`Retail  {retailBar} {retailPct}%`
`Dust    {dustBar} {dustPct}%`

🐦 {tweetUrl}', false, 'Telegram notification sent after each Intel XBot tweet'),

  ('tg_search', '🔎 *Search Surge Detected*

🪙 *${ticker}* ({name})

📊 {searchCount} searches in {timeWindow}
👥 {uniqueIps} unique IPs

⚡ Trigger: {triggerType}
📍 Status: Queued for analysis

🔗 blackbox.farm/holders?token={ca}', false, 'Telegram notification for search surge detection')

ON CONFLICT (template_name) DO UPDATE SET
  template_text = EXCLUDED.template_text,
  description = EXCLUDED.description,
  updated_at = now();