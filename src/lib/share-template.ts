// Single source of truth for share templates
// All sharing functionality across the app uses this

import { supabase } from '@/integrations/supabase/client';

export const HOLDERS_SHARE_VERSION = "20260122";

export const HOLDERS_SHARE_URL = (() => {
  const url = new URL("https://blackbox.farm/holders");
  url.searchParams.set("v", HOLDERS_SHARE_VERSION);
  return url.toString();
})();

// Template names
export type TemplateName = 'small' | 'large' | 'shares' | 'tg_posted' | 'tg_search' | 'subscription' | 'bot_holders' | 'bot_holders_lite' | 'bot_momentum' | 'bot_verdict' | 'bot_verdict_lite' | 'bot_oracle' | 'bot_wallet';

// Bump this key to force reset of old templates in localStorage
export const TEMPLATE_STORAGE_KEY = 'share-tweet-template-v3';

// Fallback templates in case DB fetch fails
export const DEFAULT_TEMPLATES: Record<TemplateName, string> = {
  small: `🔍 $\{ticker} Holder Analysis

📊 {totalWallets} Total | ✅ {realHolders} Real
{dustPct}% Dust | Health: {healthGrade}

👉 blackbox.farm/holders?token={ca}`,

  large: `🔎 Holder Analysis: $\{ticker}

CA: {ca}

Health: {healthGrade} ({healthScore}/100)

📊 {totalWallets} Total Wallets
✅ {realHolders} Real Holders
{dustPct}% are dust wallets

🐋 {whales} Whales (>$1K)
💼 {serious} Serious ($200-$1K)
🌱 {retail} Retail ($1-$199)
💨 {dust} Dust (<$1)

Free report 👉 blackbox.farm/holders?token={ca}`,

  shares: `🔎 Holder Analysis: $\{ticker}

CA: {ca}

Health: {healthGrade} ({healthScore}/100)

📊 {totalWallets} Total Wallets
✅ {realHolders} Real Holders
{dustPct}% are dust wallets

🐋 {whales} Whales (>$1K)
💼 {serious} Serious ($200-$1K)
🌱 {retail} Retail ($1-$199)
💨 {dust} Dust (<$1)

Analyze any token 👉 blackbox.farm/holders`,

  tg_posted: `📢 *Intel XBot Posted*

🪙 *$\{ticker}*
├ Holders: {totalWallets}
├ Real: {realHolders}
├ Grade: {healthGrade}
└ Post #{timesPosted}

📈 Distribution
\`Whales  {whaleBar} {whalePct}%\`
\`Serious {seriousBar} {seriousPct}%\`
\`Retail  {retailBar} {retailPct}%\`
\`Dust    {dustBar} {dustPct}%\`

🐦 {tweetUrl}`,

  tg_search: `📊 *Holders Report Generated*

🪙 *$\{ticker}* ({name})

📈 Analysis Complete
├ Total: {totalWallets}
├ Real: {realHolders}
├ Dust: {dustPct}%
└ Grade: {healthGrade}

🐋 Whale: {whales} | 💼 Serious: {serious}
🌱 Retail: {retail} | 💨 Dust: {dust}

🔗 blackbox.farm/holders?token={ca}`,

  subscription: `🔎 Holder Analysis: $\{ticker}

CA: {ca}

Health: {healthGrade} ({healthScore}/100)

📊 {totalWallets} Total Wallets
✅ {realHolders} Real Holders
{dustPct}% are dust wallets

🐋 {whales} Whales (>$1K)
💼 {serious} Serious ($200-$1K)
🌱 {retail} Retail ($1-$199)
💨 {dust} Dust (<$1)

🧠 AI Overview:
{ai_overview}

📈 Lifecycle: {lifecycle}

🔮 Dev Reputation: {dev_rep}
🐦 X Community: {x_community}
🌐 Website: {website}

Free report 👉 blackbox.farm/holders?token={ca}`,

  bot_holders: `📊 *Holders Report*

👥 Total: *{totalWallets}*
❤️ Health: *{healthScore}*/100

*Distribution:*
\`Whales  {whaleBar} {whalePct}%\`
\`Serious {seriousBar} {seriousPct}%\`
\`Retail  {retailBar} {retailPct}%\`
\`Dust    {dustBar} {dustPct}%\`

💡 *AI Summary:*
{ai_summary}`,

  bot_holders_lite: `📊 *Holders Lite*

👥 Holders: *{totalWallets}*
❤️ Health: *{healthScore}/100*
🏦 Top 10% hold: *{whalePct}%*

_Upgrade to X Subscriber for full breakdown._`,

  bot_momentum: `📈 *Momentum Analysis*

{scoreEmoji} Score: *{momentumScore}/100* — {recommendation}
🎯 Action: *{action}*

💰 Price: {price}
📊 MCap: {mcap}
⏱ 5m: {change5m}
🕐 1h: {change1h}
📦 Vol 5m: {vol5m}
⚖️ Buy/Sell: {buySellRatio}
🕰 Age: {age}

*Signals:*
{signals}`,

  bot_verdict: `{verdictEmoji} *{verdict}*

{description}

📈 Momentum: *{momentumScore}/100*
❤️ Health: *{healthScore}/100*
⏱ 5m: {change5m}
⚖️ Buy/Sell: {buySellRatio}

*Key signals:*
{signals}`,

  bot_verdict_lite: `{verdictEmoji} *{verdictLabel}*

_Upgrade to X Subscriber for detailed sizing recommendations._`,

  bot_oracle: `🔮 *Oracle Report*

👤 Dev: \`{devAddress}\`
📊 Rep Score: *{repScore}/100*
🪙 Tokens Created: *{totalTokens}*
🚩 Rugs: *{rugCount}*
⏱ Avg Lifespan: *{avgLifespan}*
🏷 Class: *{classification}*

{riskEmoji} Risk: *{riskLevel}*

🕸 *Mesh Connections:*
{meshConnections}

💡 {summary}`,

  bot_wallet: `🔎 *Wallet Analysis*

📍 \`{walletAddress}\`

🏷 Type: *{classification}*
📊 Total Txns: *{totalTxns}*
🎯 Win Rate: *{winRate}*
💰 PnL: *{pnl}*
⏱ Avg Hold: *{avgHold}*
🪙 Tokens: *{tokensTraded}*

🚩 *Risk Flags:*
{riskFlags}

💡 {summary}`,
};

// Legacy default for backwards compatibility
export const DEFAULT_TWEET_TEMPLATE = DEFAULT_TEMPLATES.shares;

export const TEMPLATE_VARIABLES = [
  { var: '{ticker}', desc: 'Token symbol' },
  { var: '{name}', desc: 'Token full name' },
  { var: '{ca}', desc: 'Contract address' },
  { var: '{totalWallets}', desc: 'Total wallet count' },
  { var: '{realHolders}', desc: 'Real holder count' },
  { var: '{dustPct}', desc: 'Dust percentage' },
  { var: '{whales}', desc: 'Whale count (≥$1K)' },
  { var: '{serious}', desc: 'Serious holder count ($200-$999)' },
  { var: '{realRetail}', desc: 'Retail holder count ($50-$199)' },
  { var: '{casual}', desc: 'Casual holder count ($1-$49)' },
  { var: '{retail}', desc: 'Retail holder count ($1-$199) - legacy' },
  { var: '{dust}', desc: 'Dust holder count (<$1)' },
  { var: '{healthGrade}', desc: 'Grade (A+, B+, etc)' },
  { var: '{healthScore}', desc: 'Score (0-100)' },
  { var: '{timestamp}', desc: 'Current UTC timestamp' },
  { var: '{comment1}', desc: 'Milestone comment (Intel posts)' },
  { var: '{ai_summary}', desc: 'AI-generated 1-2 sentence interpretation (when enabled)' },
  { var: '{ai_overview}', desc: 'AI-generated multi-paragraph overview (Subscription posts)' },
  { var: '{lifecycle}', desc: 'Token lifecycle stage (Genesis, Discovery, etc.)' },
  { var: '{risk}', desc: 'Network risk signal (🟢 STRONG NETWORK, 🟡 SPECULATIVE, 🔴 HIGH RISK)' },
  { var: '{risk_detail}', desc: 'Risk assessment explanation (1-2 sentences)' },
  { var: '{dev_rep}', desc: 'Dev reputation summary (e.g. ✅ Trusted (82/100) or 🚩 Suspicious (23/100))' },
  { var: '{x_community}', desc: 'X Community link from DexScreener (if exists)' },
  { var: '{website}', desc: 'Website URL from DexScreener (if exists)' },
  // Telegram-specific variables
  { var: '{timesPosted}', desc: 'Number of times token was posted (TG Posted)' },
  { var: '{whaleBar}', desc: 'ASCII bar for whale percentage (TG)' },
  { var: '{seriousBar}', desc: 'ASCII bar for serious percentage (TG)' },
  { var: '{retailBar}', desc: 'ASCII bar for retail percentage (TG)' },
  { var: '{dustBar}', desc: 'ASCII bar for dust percentage (TG)' },
  { var: '{whalePct}', desc: 'Whale percentage number (TG)' },
  { var: '{seriousPct}', desc: 'Serious percentage number (TG)' },
  { var: '{retailPct}', desc: 'Retail percentage number (TG)' },
  { var: '{tweetUrl}', desc: 'URL of the posted tweet (TG Posted)' },
  // TG Search (Holders Report Generated) uses the same variables as other templates
];

export interface TokenShareData {
  ticker: string;
  name: string;
  tokenAddress: string;
  totalWallets: number;
  realHolders: number;
  dustCount: number;
  dustPercentage: number;
  whales: number;
  serious: number;
  realRetail: number;  // $50-$199
  casual: number;      // $1-$49
  retail: number;      // $1-$199 (legacy)
  healthGrade: string;
  healthScore: number;

  // Optional Intel/AI enhancements (used by Intel XBot + manual admin posting)
  comment1?: string;
  aiSummary?: string;
  aiOverview?: string;
  lifecycle?: string;
  risk?: string;
  riskDetail?: string;
  devRep?: string;
  xCommunity?: string;
  website?: string;
}

export interface TemplateRecord {
  id: string;
  template_name: TemplateName;
  template_text: string;
  is_active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// Fetch all templates from database
export async function fetchAllTemplates(): Promise<TemplateRecord[]> {
  const { data, error } = await supabase
    .from('holders_intel_templates')
    .select('*')
    .order('template_name');
  
  if (error) {
    console.error('Failed to fetch templates:', error);
    return [];
  }
  
  return data as TemplateRecord[];
}

// Fetch a specific template by name
export async function fetchTemplate(name: TemplateName): Promise<string> {
  const { data, error } = await supabase
    .from('holders_intel_templates')
    .select('template_text')
    .eq('template_name', name)
    .single();
  
  if (error || !data) {
    console.error(`Failed to fetch ${name} template:`, error);
    return DEFAULT_TEMPLATES[name];
  }
  
  return data.template_text;
}

// Fetch the active Intel XBot template (small or large)
export async function fetchActiveIntelTemplate(): Promise<{ name: TemplateName; text: string }> {
  const { data, error } = await supabase
    .from('holders_intel_templates')
    .select('template_name, template_text')
    .in('template_name', ['small', 'large'])
    .eq('is_active', true)
    .single();
  
  if (error || !data) {
    console.error('Failed to fetch active Intel template:', error);
    return { name: 'small', text: DEFAULT_TEMPLATES.small };
  }
  
  return { name: data.template_name as TemplateName, text: data.template_text };
}

// Update a template in the database
export async function updateTemplate(name: TemplateName, text: string): Promise<boolean> {
  const { error } = await supabase
    .from('holders_intel_templates')
    .update({ 
      template_text: text,
      updated_at: new Date().toISOString()
    })
    .eq('template_name', name);
  
  if (error) {
    console.error(`Failed to update ${name} template:`, error);
    return false;
  }
  
  return true;
}

// Toggle which Intel template is active (small or large)
export async function setActiveIntelTemplate(name: 'small' | 'large'): Promise<boolean> {
  const otherName = name === 'small' ? 'large' : 'small';
  
  // Deactivate the other one
  const { error: deactivateError } = await supabase
    .from('holders_intel_templates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('template_name', otherName);
  
  if (deactivateError) {
    console.error(`Failed to deactivate ${otherName} template:`, deactivateError);
    return false;
  }
  
  // Activate the selected one
  const { error: activateError } = await supabase
    .from('holders_intel_templates')
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq('template_name', name);
  
  if (activateError) {
    console.error(`Failed to activate ${name} template:`, activateError);
    return false;
  }
  
  return true;
}

// Legacy: Get template from localStorage or fallback to default (for backwards compat)
export function getTemplate(): string {
  if (typeof window === 'undefined') return DEFAULT_TWEET_TEMPLATE;
  const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
  return saved || DEFAULT_TWEET_TEMPLATE;
}

// Legacy: Save template to localStorage
export function saveTemplate(template: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TEMPLATE_STORAGE_KEY, template);
}

/**
 * Sanitize token names that look like URLs to prevent Twitter from
 * detecting them as links and hijacking the OG preview.
 * e.g. "click.fun" -> "click .fun" to break URL detection
 */
function sanitizeUrlLikeName(name: string): string {
  if (!name) return name;
  
  // Common TLDs that Twitter might detect as URLs
  const urlTlds = /\.(fun|com|io|xyz|net|org|co|ai|app|dev|gg|me|tv|live|lol|meme|wtf|sol|pump|token|coin|finance|fi|exchange|swap|trade|market|money|cash|pay|crypto|nft|dao|defi|web3|eth|btc|dex)$/i;
  
  // Check if the name ends with a URL-like TLD
  if (urlTlds.test(name)) {
    // Insert space before the dot to break URL detection
    return name.replace(/\.([a-z]+)$/i, ' .$1');
  }
  
  // Also catch names that contain dots mid-string with TLD patterns
  const midUrlPattern = /\.(?:fun|com|io|xyz|net|org|co|ai|app|dev|gg|me|tv|live|lol|meme|wtf|sol|pump|token|coin|finance|fi|exchange|swap|trade|market|money|cash|pay|crypto|nft|dao|defi|web3|eth|btc|dex)(?:\s|$)/gi;
  if (midUrlPattern.test(name)) {
    return name.replace(/\.([a-z]+)/gi, ' .$1');
  }
  
  return name;
}

// Process template with actual token data
export function processTemplate(template: string, data: TokenShareData): string {
  const now = new Date();
  const utcTimestamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  
  // Sanitize URL-like names to prevent Twitter hijacking the OG preview
  const safeName = sanitizeUrlLikeName(data.name);

  const comment1 = data.comment1 ?? '';
  const aiSummary = data.aiSummary ?? '';
  const aiOverview = data.aiOverview ?? '';
  const lifecycle = data.lifecycle ?? '';
  const risk = data.risk ?? '';
  const riskDetail = data.riskDetail ?? '';
  const devRep = data.devRep ?? 'Unknown';
  const xCommunity = data.xCommunity ?? 'N/A';
  const website = data.website ?? 'N/A';
  
  return template
    .replace(/\{ticker\}/g, data.ticker)
    .replace(/\{name\}/g, safeName)
    .replace(/\{ca\}/g, data.tokenAddress)
    .replace(/\{totalWallets\}/g, data.totalWallets.toLocaleString())
    .replace(/\{realHolders\}/g, data.realHolders.toLocaleString())
    .replace(/\{dustPct\}/g, Math.round(data.dustPercentage).toString())
    .replace(/\{whales\}/g, data.whales.toLocaleString())
    .replace(/\{serious\}/g, data.serious.toLocaleString())
    .replace(/\{realRetail\}/g, data.realRetail.toLocaleString())
    .replace(/\{casual\}/g, data.casual.toLocaleString())
    .replace(/\{retail\}/g, data.retail.toLocaleString())
    .replace(/\{dust\}/g, data.dustCount.toLocaleString())
    .replace(/\{healthGrade\}/g, data.healthGrade)
    .replace(/\{healthScore\}/g, data.healthScore.toString())
    .replace(/\{timestamp\}/g, utcTimestamp)
    // Intel/AI variables
    .replace(/\{comment1\}/g, comment1)
    .replace(/\{COMMENT1\}/g, comment1)
    .replace(/\{ai_summary\}/g, aiSummary)
    .replace(/\{AI_SUMMARY\}/g, aiSummary)
    .replace(/\{ai_overview\}/g, aiOverview)
    .replace(/\{AI_OVERVIEW\}/g, aiOverview)
    .replace(/\{lifecycle\}/g, lifecycle)
    .replace(/\{LIFECYCLE\}/g, lifecycle)
    .replace(/\{risk\}/g, risk)
    .replace(/\{RISK\}/g, risk)
    .replace(/\{risk_detail\}/g, riskDetail)
    .replace(/\{RISK_DETAIL\}/g, riskDetail)
    .replace(/\{dev_rep\}/g, devRep)
    .replace(/\{DEV_REP\}/g, devRep)
    .replace(/\{x_community\}/g, xCommunity)
    .replace(/\{X_COMMUNITY\}/g, xCommunity)
    .replace(/\{website\}/g, website)
    .replace(/\{WEBSITE\}/g, website);
}

// Get share URL with token address
export function getShareUrl(tokenAddress: string): string {
  const url = new URL("https://blackbox.farm/holders");
  url.searchParams.set("token", tokenAddress);
  url.searchParams.set("v", HOLDERS_SHARE_VERSION);
  return url.toString();
}
