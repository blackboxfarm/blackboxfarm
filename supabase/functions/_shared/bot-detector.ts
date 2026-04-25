/**
 * Shared User-Agent classifier for crawler / AI-bot detection.
 * Used by `intel-share` and `track-briefing-view`.
 */

export type VisitorType = 'human' | 'crawler' | 'ai_bot';

const PATTERNS: [RegExp, string, VisitorType][] = [
  // Social crawlers
  [/facebookexternalhit|facebot/, 'facebookbot', 'crawler'],
  [/twitterbot/, 'twitterbot', 'crawler'],
  [/linkedinbot/, 'linkedinbot', 'crawler'],
  [/discordbot/, 'discordbot', 'crawler'],
  [/slackbot/, 'slackbot', 'crawler'],
  [/telegrambot/, 'telegrambot', 'crawler'],
  [/whatsapp/, 'whatsapp', 'crawler'],
  [/pinterestbot/, 'pinterestbot', 'crawler'],
  [/meta-externalagent/, 'meta-agent', 'crawler'],
  [/instagram/, 'instagrambot', 'crawler'],
  [/threads/, 'threadsbot', 'crawler'],
  // Search crawlers
  [/googlebot/, 'googlebot', 'crawler'],
  [/bingbot/, 'bingbot', 'crawler'],
  [/applebot/, 'applebot', 'crawler'],
  [/yandexbot/, 'yandexbot', 'crawler'],
  [/baiduspider/, 'baiduspider', 'crawler'],
  [/duckduckbot/, 'duckduckbot', 'crawler'],
  [/ahrefsbot|semrushbot|mj12bot|dotbot/, 'seo-crawler', 'crawler'],
  // AI bots
  [/chatgpt-user|oai-searchbot|gptbot/, 'chatgpt', 'ai_bot'],
  [/claudebot|anthropic|claude-web/, 'claudebot', 'ai_bot'],
  [/perplexitybot|perplexity/, 'perplexitybot', 'ai_bot'],
  [/cohere-ai/, 'cohere', 'ai_bot'],
  [/gemini|google-extended/, 'gemini', 'ai_bot'],
  [/ccbot/, 'ccbot', 'ai_bot'],
  [/bytespider|youbot|amazonbot/, 'misc-ai', 'ai_bot'],
  [/ia_archiver/, 'ia_archiver', 'crawler'],
  // Generic catch-all (last)
  [/bot|crawler|spider|headlesschrome|phantomjs|puppeteer|playwright/, 'generic-bot', 'crawler'],
];

export interface BotMatch {
  visitorType: VisitorType;
  botName: string | null;
}

export function classifyUserAgent(userAgent: string | null | undefined): BotMatch {
  const ua = (userAgent || '').toLowerCase();
  if (!ua) return { visitorType: 'human', botName: null };
  for (const [pattern, name, type] of PATTERNS) {
    if (pattern.test(ua)) return { visitorType: type, botName: name };
  }
  return { visitorType: 'human', botName: null };
}

/**
 * Map a referrer URL to a normalized source bucket for dashboards.
 * Returns 'direct' if the referrer is missing or same-origin to BlackBox.
 */
export function parseReferrerSource(
  referer: string | null | undefined,
  selfHost = 'blackbox.farm',
): string {
  if (!referer) return 'direct';
  try {
    const u = new URL(referer);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === selfHost || host.endsWith('.' + selfHost)) return 'direct';
    // Normalize known shorteners / mobile variants
    if (host === 'l.instagram.com' || host === 'l.facebook.com' || host === 'lm.facebook.com') {
      return host.replace(/^l\.|^lm\./, '');
    }
    if (host === 't.co') return 'twitter.com';
    if (host === 'www.threads.net') return 'threads.net';
    return host;
  } catch {
    return 'unknown';
  }
}