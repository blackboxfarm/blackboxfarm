-- Update tg_search template from "Search Surge" to "Holders Report Generated"
UPDATE holders_intel_templates
SET 
  template_text = E'📊 *Holders Report Generated*\n\n🪙 *${ticker}* ({name})\n\n📈 Analysis Complete\n├ Total: {totalWallets}\n├ Real: {realHolders}\n├ Dust: {dustPct}%\n└ Grade: {healthGrade}\n\n🐋 Whale: {whales} | 💼 Serious: {serious}\n🌱 Retail: {retail} | 💨 Dust: {dust}\n\n🔗 blackbox.farm/holders?token={ca}',
  description = 'Telegram notification when a holders report is generated on /holders',
  updated_at = NOW()
WHERE template_name = 'tg_search';