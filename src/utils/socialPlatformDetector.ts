// Detect social platform from URL
export type SocialPlatform = 
  | 'twitter' 
  | 'telegram' 
  | 'tiktok' 
  | 'instagram' 
  | 'youtube' 
  | 'discord' 
  | 'reddit'
  | 'facebook'
  | 'linkedin'
  | 'github'
  | 'medium'
  | 'twitch'
  | 'website';

interface SocialPlatformInfo {
  platform: SocialPlatform;
  label: string;
}

export function detectSocialPlatform(url: string): SocialPlatformInfo {
  if (!url) return { platform: 'website', label: 'Website' };
  
  const lowerUrl = url.toLowerCase();
  
  // Twitter/X
  if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) {
    return { platform: 'twitter', label: 'X/Twitter' };
  }
  
  // Telegram
  if (lowerUrl.includes('t.me') || lowerUrl.includes('telegram.')) {
    return { platform: 'telegram', label: 'Telegram' };
  }
  
  // TikTok
  if (lowerUrl.includes('tiktok.com') || lowerUrl.includes('tiktok.')) {
    return { platform: 'tiktok', label: 'TikTok' };
  }
  
  // Instagram
  if (lowerUrl.includes('instagram.com') || lowerUrl.includes('instagr.am')) {
    return { platform: 'instagram', label: 'Instagram' };
  }
  
  // YouTube
  if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
    return { platform: 'youtube', label: 'YouTube' };
  }
  
  // Discord
  if (lowerUrl.includes('discord.gg') || lowerUrl.includes('discord.com')) {
    return { platform: 'discord', label: 'Discord' };
  }
  
  // Reddit
  if (lowerUrl.includes('reddit.com')) {
    return { platform: 'reddit', label: 'Reddit' };
  }
  
  // Facebook
  if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.com') || lowerUrl.includes('fb.me')) {
    return { platform: 'facebook', label: 'Facebook' };
  }
  
  // LinkedIn
  if (lowerUrl.includes('linkedin.com')) {
    return { platform: 'linkedin', label: 'LinkedIn' };
  }
  
  // GitHub
  if (lowerUrl.includes('github.com')) {
    return { platform: 'github', label: 'GitHub' };
  }
  
  // Medium
  if (lowerUrl.includes('medium.com')) {
    return { platform: 'medium', label: 'Medium' };
  }
  
  // Twitch
  if (lowerUrl.includes('twitch.tv')) {
    return { platform: 'twitch', label: 'Twitch' };
  }
  
  // Default to website
  return { platform: 'website', label: 'Website' };
}
