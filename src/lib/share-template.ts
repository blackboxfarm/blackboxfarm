// Single source of truth for share templates
// All sharing functionality across the app uses this

export const HOLDERS_SHARE_VERSION = "20260122";

export const HOLDERS_SHARE_URL = (() => {
  const url = new URL("https://blackbox.farm/holders");
  url.searchParams.set("v", HOLDERS_SHARE_VERSION);
  return url.toString();
})();

// Bump this key to force reset of old templates in localStorage
export const TEMPLATE_STORAGE_KEY = 'share-tweet-template-v3';

export const DEFAULT_TWEET_TEMPLATE = `🔎 Holder Analysis: $\{ticker}

CA:{ca}

Health: {healthGrade} ({healthScore}/100)

✅ {realHolders} Real Holders ({dustPct}% Dust)

🏛 {totalWallets} Total Wallets

🐋 {whales} Whales (>$1K)

😎 {serious} Serious ($200-$1K)

🏪 {retail} Retail ($1-$199)

💨 {dust} Dust (<$1) = {dustPct}% Dust

More Holder Intel👉 ${HOLDERS_SHARE_URL}`;

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
}

// Get template from localStorage or fallback to default
export function getTemplate(): string {
  if (typeof window === 'undefined') return DEFAULT_TWEET_TEMPLATE;
  const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
  return saved || DEFAULT_TWEET_TEMPLATE;
}

// Save template to localStorage
export function saveTemplate(template: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TEMPLATE_STORAGE_KEY, template);
}

// Process template with actual token data
export function processTemplate(template: string, data: TokenShareData): string {
  const now = new Date();
  const utcTimestamp = now.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  
  return template
    .replace(/\{ticker\}/g, data.ticker)
    .replace(/\{name\}/g, data.name)
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
    .replace(/\{timestamp\}/g, utcTimestamp);
}

// Get share URL with token address
export function getShareUrl(tokenAddress: string): string {
  const url = new URL("https://blackbox.farm/holders");
  url.searchParams.set("token", tokenAddress);
  url.searchParams.set("v", HOLDERS_SHARE_VERSION);
  return url.toString();
}
