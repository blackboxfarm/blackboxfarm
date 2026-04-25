import type { LucideIcon } from 'lucide-react';
import { Globe, Twitter, Linkedin, Instagram, Facebook, MessageCircle, Send, Hash, Music2, Youtube, Sparkles, FileText, Repeat, Link2 } from 'lucide-react';

export const REPUBLISH_PLATFORMS = ['Website', 'Medium', 'Substack', 'Fiverr Repost'];
export const BREADCRUMB_PLATFORMS = [
  'Twitter/X',
  'LinkedIn',
  'Threads',
  'Instagram',
  'Facebook',
  'TikTok',
  'YouTube',
  'Bluesky',
  'Mastodon',
  'Farcaster',
  'Warpcast',
  'Reddit',
  'Telegram',
  'Discord',
  'Lens',
];

export const ALL_PLATFORMS = [...REPUBLISH_PLATFORMS, ...BREADCRUMB_PLATFORMS];

export const PLATFORM_ICONS: Record<string, LucideIcon> = {
  Website: Globe,
  Medium: FileText,
  Substack: FileText,
  'Fiverr Repost': Repeat,
  'Twitter/X': Twitter,
  LinkedIn: Linkedin,
  Threads: Hash,
  Instagram: Instagram,
  Facebook: Facebook,
  TikTok: Music2,
  YouTube: Youtube,
  Bluesky: Sparkles,
  Mastodon: Sparkles,
  Farcaster: Sparkles,
  Warpcast: Sparkles,
  Reddit: MessageCircle,
  Telegram: Send,
  Discord: MessageCircle,
  Lens: Link2,
};

export interface PublicationLite {
  id: string;
  briefing_id: string;
  platform: string;
  content_depth: number;
  is_breadcrumb?: boolean;
  published_url?: string | null;
  published_at: string;
}

/** Returns the set of platforms an article has been seeded on. */
export const platformsForArticle = (pubs: PublicationLite[], briefingId: string) =>
  new Set(pubs.filter(p => p.briefing_id === briefingId).map(p => p.platform));

/** Returns the platforms that have NOT been used yet for this article. */
export const missingPlatforms = (pubs: PublicationLite[], briefingId: string) => {
  const seen = platformsForArticle(pubs, briefingId);
  return ALL_PLATFORMS.filter(p => !seen.has(p));
};