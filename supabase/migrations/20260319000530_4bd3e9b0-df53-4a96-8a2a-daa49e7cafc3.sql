
UPDATE holders_intel_templates
SET template_text = E'🔎 HOLDER INTEL: ${ticker} {name}\n{ca}\nHealth: {healthGrade} ({healthScore}/100){comment1}!\n✅ {realHolders} Real Holders \n📊 {totalWallets} Total Wallets\n ⏱️{timestamp}⏱️ {lifecycle}\n🐋 {whales} Whales (>$1K)\n😎 {serious} Serious ($200-$1K)\n🏪 {retail} Retail ($1-$199)\n💨 {dust} Dust (<$1) = {dustPct}% Dust\n{ai_summary}\nMore Holder Intel👇 https://blackbox.farm/holders?v=holders3\n\nView Charts on Trader 👉 padre.gg/rk=blackbox\n.\n.'
WHERE template_name = 'large';

UPDATE holders_intel_templates
SET template_text = E'🔎 HOLDER INTEL: ${ticker} {name}\n{ca}\nHealth: {healthGrade} ({healthScore}/100){comment1}!\n✅ {realHolders} Real Holders \n📊 {totalWallets} Total Wallets\n 🐋 {whales} Whales (>$1K)\n 😎 {serious} Serious ($200-$1K)\n 🏪 {retail} Retail ($1-$199)\n 💨 {dust} Dust (<$1) = {dustPct}% Dust\n\nView Full Holder Intel👇 https://blackbox.farm/holders?v=holders3'
WHERE template_name = 'shares';
