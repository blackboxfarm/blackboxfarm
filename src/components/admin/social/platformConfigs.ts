export interface PlatformConfig {
  id: string;
  name: string;
  emoji: string;
  colorClass: string;
  maxChars: number | null; // null = unlimited
  requiresImage: boolean;
  requiresVideo: boolean;
  hasTitle: boolean;
  postUrl: string;
  apiStatus: 'has_api' | 'no_api';
  notes?: string;
}

export const PLATFORM_CONFIGS: PlatformConfig[] = [
  { id: 'x', name: 'X / Twitter', emoji: '🐦', colorClass: 'bg-sky-500/20 text-sky-300', maxChars: 280, requiresImage: false, requiresVideo: false, hasTitle: false, postUrl: 'https://twitter.com/compose/tweet', apiStatus: 'has_api' },
  { id: 'threads', name: 'Threads', emoji: '🧵', colorClass: 'bg-purple-500/20 text-purple-300', maxChars: 500, requiresImage: false, requiresVideo: false, hasTitle: false, postUrl: 'https://www.threads.net', apiStatus: 'no_api' },
  { id: 'instagram', name: 'Instagram', emoji: '📸', colorClass: 'bg-pink-500/20 text-pink-300', maxChars: 2200, requiresImage: true, requiresVideo: false, hasTitle: false, postUrl: 'https://www.instagram.com', apiStatus: 'has_api' },
  { id: 'facebook', name: 'Facebook', emoji: '📘', colorClass: 'bg-blue-500/20 text-blue-300', maxChars: 63206, requiresImage: false, requiresVideo: false, hasTitle: false, postUrl: 'https://www.facebook.com', apiStatus: 'has_api' },
  { id: 'linkedin', name: 'LinkedIn', emoji: '💼', colorClass: 'bg-blue-600/20 text-blue-300', maxChars: 3000, requiresImage: false, requiresVideo: false, hasTitle: false, postUrl: 'https://www.linkedin.com/feed/', apiStatus: 'has_api' },
  { id: 'tiktok', name: 'TikTok', emoji: '🎵', colorClass: 'bg-rose-500/20 text-rose-300', maxChars: 2200, requiresImage: false, requiresVideo: true, hasTitle: true, postUrl: 'https://www.tiktok.com/upload', apiStatus: 'has_api' },
  { id: 'youtube', name: 'YouTube', emoji: '▶️', colorClass: 'bg-red-500/20 text-red-300', maxChars: 5000, requiresImage: true, requiresVideo: true, hasTitle: true, postUrl: 'https://studio.youtube.com', apiStatus: 'has_api', notes: 'Max chars = description. Thumbnail required.' },
  { id: 'reddit', name: 'Reddit', emoji: '🤖', colorClass: 'bg-orange-500/20 text-orange-300', maxChars: 40000, requiresImage: false, requiresVideo: false, hasTitle: true, postUrl: 'https://www.reddit.com/submit', apiStatus: 'has_api' },
  { id: 'pinterest', name: 'Pinterest', emoji: '📌', colorClass: 'bg-red-600/20 text-red-300', maxChars: 500, requiresImage: true, requiresVideo: false, hasTitle: true, postUrl: 'https://www.pinterest.com/pin-creation-tool/', apiStatus: 'has_api' },
  { id: 'telegram', name: 'Telegram', emoji: '✈️', colorClass: 'bg-sky-400/20 text-sky-300', maxChars: 4096, requiresImage: false, requiresVideo: false, hasTitle: false, postUrl: 'https://web.telegram.org', apiStatus: 'has_api' },
  { id: 'discord', name: 'Discord', emoji: '🎮', colorClass: 'bg-indigo-500/20 text-indigo-300', maxChars: 2000, requiresImage: false, requiresVideo: false, hasTitle: false, postUrl: 'https://discord.com/channels/@me', apiStatus: 'has_api' },
  { id: 'medium', name: 'Medium', emoji: '📝', colorClass: 'bg-green-700/20 text-green-300', maxChars: null, requiresImage: false, requiresVideo: false, hasTitle: true, postUrl: 'https://medium.com/new-story', apiStatus: 'has_api' },
  { id: 'substack', name: 'Substack', emoji: '📰', colorClass: 'bg-orange-600/20 text-orange-300', maxChars: null, requiresImage: false, requiresVideo: false, hasTitle: true, postUrl: 'https://substack.com/dashboard', apiStatus: 'no_api' },
  { id: 'mirror', name: 'Mirror.xyz', emoji: '🪞', colorClass: 'bg-cyan-500/20 text-cyan-300', maxChars: null, requiresImage: false, requiresVideo: false, hasTitle: true, postUrl: 'https://mirror.xyz/dashboard', apiStatus: 'has_api' },
  { id: 'hashnode', name: 'Hashnode', emoji: '🔷', colorClass: 'bg-blue-400/20 text-blue-300', maxChars: null, requiresImage: false, requiresVideo: false, hasTitle: true, postUrl: 'https://hashnode.com/draft', apiStatus: 'has_api' },
  { id: 'devto', name: 'Dev.to', emoji: '👩‍💻', colorClass: 'bg-gray-500/20 text-gray-300', maxChars: null, requiresImage: false, requiresVideo: false, hasTitle: true, postUrl: 'https://dev.to/new', apiStatus: 'has_api' },
  { id: 'farcaster', name: 'Farcaster', emoji: '🟣', colorClass: 'bg-purple-600/20 text-purple-300', maxChars: 1024, requiresImage: false, requiresVideo: false, hasTitle: false, postUrl: 'https://warpcast.com/~/compose', apiStatus: 'has_api' },
  { id: 'lens', name: 'Lens Protocol', emoji: '🌿', colorClass: 'bg-green-500/20 text-green-300', maxChars: 5000, requiresImage: false, requiresVideo: false, hasTitle: false, postUrl: 'https://hey.xyz', apiStatus: 'has_api' },
  { id: 'warpcast', name: 'Warpcast', emoji: '🟪', colorClass: 'bg-violet-500/20 text-violet-300', maxChars: 1024, requiresImage: false, requiresVideo: false, hasTitle: false, postUrl: 'https://warpcast.com/~/compose', apiStatus: 'has_api' },
  { id: 'quora', name: 'Quora', emoji: '❓', colorClass: 'bg-red-700/20 text-red-300', maxChars: 100000, requiresImage: false, requiresVideo: false, hasTitle: true, postUrl: 'https://www.quora.com', apiStatus: 'no_api' },
  { id: 'twitch', name: 'Twitch', emoji: '🎬', colorClass: 'bg-purple-400/20 text-purple-300', maxChars: 500, requiresImage: false, requiresVideo: true, hasTitle: true, postUrl: 'https://dashboard.twitch.tv', apiStatus: 'has_api', notes: 'Max chars = stream title' },
  { id: 'kick', name: 'Kick', emoji: '🥊', colorClass: 'bg-green-400/20 text-green-300', maxChars: 500, requiresImage: false, requiresVideo: true, hasTitle: true, postUrl: 'https://kick.com/dashboard', apiStatus: 'no_api' },
  { id: 'snapchat', name: 'Snapchat', emoji: '👻', colorClass: 'bg-yellow-400/20 text-yellow-300', maxChars: 250, requiresImage: true, requiresVideo: false, hasTitle: false, postUrl: 'https://www.snapchat.com', apiStatus: 'no_api' },
  { id: 'guild', name: 'Guild', emoji: '🏰', colorClass: 'bg-amber-500/20 text-amber-300', maxChars: null, requiresImage: false, requiresVideo: false, hasTitle: true, postUrl: 'https://guild.xyz', apiStatus: 'no_api' },
  { id: 'debank', name: 'DeBank', emoji: '🏦', colorClass: 'bg-teal-500/20 text-teal-300', maxChars: 1000, requiresImage: false, requiresVideo: false, hasTitle: false, postUrl: 'https://debank.com', apiStatus: 'no_api' },
];

export type MasterTemplateData = {
  title: string;
  bodyLong: string;
  bodyShort: string;
  hashtags: string;
  imageUrl: string;
  videoUrl: string;
  linkUrl: string;
  altText: string;
  tagsMentions: string;
  ctaText: string;
  category: string;
};

export const CATEGORIES = ['Announcement', 'Alpha', 'Meme', 'Thread', 'Tutorial', 'Update', 'Promo'] as const;
