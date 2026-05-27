UPDATE public.holders_intel_templates
SET template_text = $$🐸 *${ticker}*
{multiplierLine}
━━━━━━━━━━━━

🟢 Momentum: {momentum}
🟡 Risk: {risk}
⚡ Verdict: {verdict}

💰 *Market*
MC: {mc} ({mcChange})
VOL: {vol24h}
LP: {lp}
Age: {age}

🧠 *Holder Health*
Top 10: {top10}
Fresh Wallets: {freshWallets}
Wallet Spread: {walletSpread}
Bundled Risk: {bundledRisk}

🤖 *BlackBox AI*
• {aiBullet1}
• {aiBullet2}
• {aiBullet3}
• {aiBullet4}

🕵️ *Developer Intel*
Funded By: {fundedBy}
Past Launches: {pastLaunches}
Rugs: {rugs}
Reputation: {devReputation}

*BLACKBOX SCORE: {blackboxScore}/100*

[📈 Chart]({chartUrl}) · [🐋 BubbleMap]({bubbleMapUrl}) · [🧠 Full Intel]({intelUrl})
[💰 Buy]({buyUrl}) · [⚠️ Scan History]({scanHistoryUrl}) · [🌐 Socials]({socialsUrl})

CA: `{ca}`$$,
updated_at = now()
WHERE template_name IN ('no_lube','no_lube_public');

UPDATE public.holders_intel_templates
SET template_text = $$🐸 *${ticker}* — PRIVATE
{multiplierLine}
━━━━━━━━━━━━

🟢 Momentum: {momentum}
🟡 Risk: {risk}
⚡ Verdict: {verdict}

💰 *Market*
MC: {mc} ({mcChange})
VOL: {vol24h}
LP: {lp}
Age: {age}

🧠 *Holder Health*
Top 10: {top10}
Fresh Wallets: {freshWallets}
Wallet Spread: {walletSpread}
Bundled Risk: {bundledRisk}

🤖 *BlackBox AI*
• {aiBullet1}
• {aiBullet2}
• {aiBullet3}
• {aiBullet4}

🕵️ *Developer Intel*
Funded By: {fundedBy}
Past Launches: {pastLaunches}
Rugs: {rugs}
Reputation: {devReputation}

*BLACKBOX SCORE: {blackboxScore}/100*

[📈 Chart]({chartUrl}) · [🐋 BubbleMap]({bubbleMapUrl}) · [🧠 Full Intel]({intelUrl})
[💰 Buy]({buyUrl}) · [⚠️ Scan History]({scanHistoryUrl}) · [🌐 Socials]({socialsUrl})

CA: `{ca}`$$,
updated_at = now()
WHERE template_name = 'no_lube_private';