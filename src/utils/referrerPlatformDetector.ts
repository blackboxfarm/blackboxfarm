// Maps known referrer domains to human-readable platform names
// Used by Visitors dashboard to classify traffic sources

export interface ReferrerPlatform {
  platform: string;
  label: string;
  emoji: string;
  category: 'social' | 'search' | 'messaging' | 'ad' | 'crypto' | 'direct' | 'other';
}

const REFERRER_MAP: Record<string, ReferrerPlatform> = {
  // Twitter/X
  't.co': { platform: 'twitter', label: 'X / Twitter', emoji: '🐦', category: 'social' },
  'twitter.com': { platform: 'twitter', label: 'X / Twitter', emoji: '🐦', category: 'social' },
  'x.com': { platform: 'twitter', label: 'X / Twitter', emoji: '🐦', category: 'social' },
  'mobile.twitter.com': { platform: 'twitter', label: 'X / Twitter', emoji: '🐦', category: 'social' },

  // Facebook
  'facebook.com': { platform: 'facebook', label: 'Facebook', emoji: '📘', category: 'social' },
  'l.facebook.com': { platform: 'facebook', label: 'Facebook', emoji: '📘', category: 'social' },
  'lm.facebook.com': { platform: 'facebook', label: 'Facebook (Mobile)', emoji: '📘', category: 'social' },
  'm.facebook.com': { platform: 'facebook', label: 'Facebook (Mobile)', emoji: '📘', category: 'social' },
  'web.facebook.com': { platform: 'facebook', label: 'Facebook', emoji: '📘', category: 'social' },
  'fb.com': { platform: 'facebook', label: 'Facebook', emoji: '📘', category: 'social' },
  'fb.me': { platform: 'facebook', label: 'Facebook', emoji: '📘', category: 'social' },

  // Instagram
  'instagram.com': { platform: 'instagram', label: 'Instagram', emoji: '📸', category: 'social' },
  'l.instagram.com': { platform: 'instagram', label: 'Instagram', emoji: '📸', category: 'social' },
  'www.instagram.com': { platform: 'instagram', label: 'Instagram', emoji: '📸', category: 'social' },

  // Threads (Meta)
  'threads.net': { platform: 'threads', label: 'Threads', emoji: '🧵', category: 'social' },
  'www.threads.net': { platform: 'threads', label: 'Threads', emoji: '🧵', category: 'social' },

  // TikTok
  'tiktok.com': { platform: 'tiktok', label: 'TikTok', emoji: '🎵', category: 'social' },
  'www.tiktok.com': { platform: 'tiktok', label: 'TikTok', emoji: '🎵', category: 'social' },
  'vm.tiktok.com': { platform: 'tiktok', label: 'TikTok', emoji: '🎵', category: 'social' },

  // YouTube
  'youtube.com': { platform: 'youtube', label: 'YouTube', emoji: '▶️', category: 'social' },
  'www.youtube.com': { platform: 'youtube', label: 'YouTube', emoji: '▶️', category: 'social' },
  'youtu.be': { platform: 'youtube', label: 'YouTube', emoji: '▶️', category: 'social' },
  'm.youtube.com': { platform: 'youtube', label: 'YouTube (Mobile)', emoji: '▶️', category: 'social' },

  // Reddit
  'reddit.com': { platform: 'reddit', label: 'Reddit', emoji: '🟠', category: 'social' },
  'www.reddit.com': { platform: 'reddit', label: 'Reddit', emoji: '🟠', category: 'social' },
  'old.reddit.com': { platform: 'reddit', label: 'Reddit', emoji: '🟠', category: 'social' },
  'out.reddit.com': { platform: 'reddit', label: 'Reddit', emoji: '🟠', category: 'social' },

  // LinkedIn
  'linkedin.com': { platform: 'linkedin', label: 'LinkedIn', emoji: '💼', category: 'social' },
  'www.linkedin.com': { platform: 'linkedin', label: 'LinkedIn', emoji: '💼', category: 'social' },
  'lnkd.in': { platform: 'linkedin', label: 'LinkedIn', emoji: '💼', category: 'social' },

  // Discord
  'discord.com': { platform: 'discord', label: 'Discord', emoji: '💬', category: 'messaging' },
  'discord.gg': { platform: 'discord', label: 'Discord', emoji: '💬', category: 'messaging' },
  'canary.discord.com': { platform: 'discord', label: 'Discord', emoji: '💬', category: 'messaging' },

  // Telegram
  't.me': { platform: 'telegram', label: 'Telegram', emoji: '✈️', category: 'messaging' },
  'telegram.org': { platform: 'telegram', label: 'Telegram', emoji: '✈️', category: 'messaging' },
  'web.telegram.org': { platform: 'telegram', label: 'Telegram (Web)', emoji: '✈️', category: 'messaging' },

  // WhatsApp
  'wa.me': { platform: 'whatsapp', label: 'WhatsApp', emoji: '💚', category: 'messaging' },
  'web.whatsapp.com': { platform: 'whatsapp', label: 'WhatsApp', emoji: '💚', category: 'messaging' },
  'api.whatsapp.com': { platform: 'whatsapp', label: 'WhatsApp', emoji: '💚', category: 'messaging' },

  // Search Engines
  'google.com': { platform: 'google', label: 'Google', emoji: '🔍', category: 'search' },
  'www.google.com': { platform: 'google', label: 'Google', emoji: '🔍', category: 'search' },
  'bing.com': { platform: 'bing', label: 'Bing', emoji: '🔍', category: 'search' },
  'www.bing.com': { platform: 'bing', label: 'Bing', emoji: '🔍', category: 'search' },
  'duckduckgo.com': { platform: 'duckduckgo', label: 'DuckDuckGo', emoji: '🦆', category: 'search' },
  'search.yahoo.com': { platform: 'yahoo', label: 'Yahoo', emoji: '🔍', category: 'search' },

  // Crypto-specific
  'dexscreener.com': { platform: 'dexscreener', label: 'DexScreener', emoji: '📊', category: 'crypto' },
  'birdeye.so': { platform: 'birdeye', label: 'Birdeye', emoji: '🦅', category: 'crypto' },
  'pump.fun': { platform: 'pumpfun', label: 'Pump.fun', emoji: '🎰', category: 'crypto' },
  'raydium.io': { platform: 'raydium', label: 'Raydium', emoji: '☀️', category: 'crypto' },
  'jup.ag': { platform: 'jupiter', label: 'Jupiter', emoji: '🪐', category: 'crypto' },
  'solscan.io': { platform: 'solscan', label: 'Solscan', emoji: '🔎', category: 'crypto' },
  'solana.fm': { platform: 'solanafm', label: 'SolanaFM', emoji: '📻', category: 'crypto' },
  'coingecko.com': { platform: 'coingecko', label: 'CoinGecko', emoji: '🦎', category: 'crypto' },
  'coinmarketcap.com': { platform: 'coinmarketcap', label: 'CoinMarketCap', emoji: '📈', category: 'crypto' },
  'defined.fi': { platform: 'defined', label: 'Defined.fi', emoji: '📊', category: 'crypto' },
  'bubblemaps.io': { platform: 'bubblemaps', label: 'Bubblemaps', emoji: '🫧', category: 'crypto' },
  'app.bubblemaps.io': { platform: 'bubblemaps', label: 'Bubblemaps', emoji: '🫧', category: 'crypto' },

  // GitHub
  'github.com': { platform: 'github', label: 'GitHub', emoji: '🐙', category: 'other' },

  // Medium
  'medium.com': { platform: 'medium', label: 'Medium', emoji: '📝', category: 'other' },

  // Twitch
  'twitch.tv': { platform: 'twitch', label: 'Twitch', emoji: '🎮', category: 'social' },
  'www.twitch.tv': { platform: 'twitch', label: 'Twitch', emoji: '🎮', category: 'social' },
};

// Also detect Google country-specific domains
const GOOGLE_REGEX = /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/;

const DIRECT_PLATFORM: ReferrerPlatform = {
  platform: 'direct',
  label: 'Direct',
  emoji: '🔗',
  category: 'direct',
};

/**
 * Classify a referrer domain (or utm_source) into a known platform.
 * Falls back to showing the raw domain if unrecognised.
 */
export function classifyReferrer(
  referrerDomain: string | null,
  utmSource: string | null,
  utmMedium: string | null,
): ReferrerPlatform {
  // 1. UTM source takes priority (this is what tagged links use)
  if (utmSource) {
    const src = utmSource.toLowerCase();
    // Check if utm_source is a known platform name
    for (const info of Object.values(REFERRER_MAP)) {
      if (info.platform === src) {
        // If utm_medium=paid, mark as ad category
        if (utmMedium?.toLowerCase() === 'paid' || utmMedium?.toLowerCase() === 'cpc') {
          return { ...info, category: 'ad', label: `${info.label} (Ad)`, emoji: `💰` };
        }
        return info;
      }
    }
    // Unknown utm_source
    return {
      platform: src,
      label: src.charAt(0).toUpperCase() + src.slice(1),
      emoji: '🏷️',
      category: utmMedium?.toLowerCase() === 'paid' ? 'ad' : 'other',
    };
  }

  // 2. No UTM — use referrer domain
  if (!referrerDomain) return DIRECT_PLATFORM;

  const domain = referrerDomain.toLowerCase();

  // Exact match
  if (REFERRER_MAP[domain]) return REFERRER_MAP[domain];

  // Strip www. and try again
  const stripped = domain.replace(/^www\./, '');
  if (REFERRER_MAP[stripped]) return REFERRER_MAP[stripped];

  // Google country domains
  if (GOOGLE_REGEX.test(domain)) {
    return { platform: 'google', label: 'Google', emoji: '🔍', category: 'search' };
  }

  // Partial match — check if any key is contained in the domain
  for (const [key, info] of Object.entries(REFERRER_MAP)) {
    if (domain.includes(key)) return info;
  }

  // Unknown domain
  return {
    platform: domain,
    label: domain,
    emoji: '🌐',
    category: 'other',
  };
}

/**
 * Aggregate visits into a platform breakdown for charting.
 */
export function buildPlatformBreakdown(
  visits: Array<{
    referrer_domain: string | null;
    utm_source: string | null;
    utm_medium?: string | null;
  }>
): { platform: string; label: string; emoji: string; category: string; count: number }[] {
  const counts: Record<string, { info: ReferrerPlatform; count: number }> = {};

  for (const v of visits) {
    const info = classifyReferrer(v.referrer_domain, v.utm_source, (v as any).utm_medium ?? null);
    const key = info.platform;
    if (!counts[key]) {
      counts[key] = { info, count: 0 };
    }
    counts[key].count++;
  }

  return Object.values(counts)
    .map(({ info, count }) => ({
      platform: info.platform,
      label: info.label,
      emoji: info.emoji,
      category: info.category,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Aggregate by category (social, search, messaging, ad, crypto, direct, other)
 */
export function buildCategoryBreakdown(
  visits: Array<{
    referrer_domain: string | null;
    utm_source: string | null;
    utm_medium?: string | null;
  }>
): { category: string; count: number }[] {
  const counts: Record<string, number> = {};

  for (const v of visits) {
    const info = classifyReferrer(v.referrer_domain, v.utm_source, (v as any).utm_medium ?? null);
    counts[info.category] = (counts[info.category] || 0) + 1;
  }

  const categoryLabels: Record<string, string> = {
    social: '📱 Social',
    search: '🔍 Search',
    messaging: '💬 Messaging',
    ad: '💰 Paid Ads',
    crypto: '🪙 Crypto',
    direct: '🔗 Direct',
    other: '🌐 Other',
  };

  return Object.entries(counts)
    .map(([cat, count]) => ({
      category: categoryLabels[cat] || cat,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}
