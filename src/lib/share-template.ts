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
export type TemplateName = 'small' | 'large' | 'shares';

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
  { var: '{ai_summary}', desc: 'AI-generated 1-2 sentence interpretation (when enabled)' },
  { var: '{lifecycle}', desc: 'Token lifecycle stage (Genesis, Discovery, etc.)' },
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
    .replace(/\{timestamp\}/g, utcTimestamp);
}

// Get share URL with token address
export function getShareUrl(tokenAddress: string): string {
  const url = new URL("https://blackbox.farm/holders");
  url.searchParams.set("token", tokenAddress);
  url.searchParams.set("v", HOLDERS_SHARE_VERSION);
  return url.toString();
}
