import { SocialPlatform } from "@/utils/socialPlatformDetector";
import { Globe, Send, Youtube, Instagram, Github, MessageCircle } from "lucide-react";

// Import custom icons
import xIcon from "@/assets/icons/x-icon.png";
import tiktokIcon from "@/assets/icons/tiktok-icon.png";
import dexscreenerIcon from "@/assets/icons/dexscreener-icon.png";

interface SocialIconProps {
  platform: SocialPlatform;
  className?: string;
}

// Common style for image icons with blue drop shadow
const iconImageStyle = "drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]";

export function SocialIcon({ platform, className = "h-5 w-5" }: SocialIconProps) {
  // Icon size for images
  const sizeClasses = className;
  
  switch (platform) {
    case 'twitter':
      return (
        <img 
          src={xIcon} 
          alt="X/Twitter" 
          className={`${sizeClasses} ${iconImageStyle} rounded`}
        />
      );
    
    case 'tiktok':
      return (
        <img 
          src={tiktokIcon} 
          alt="TikTok" 
          className={`${sizeClasses} ${iconImageStyle} rounded`}
        />
      );
    
    case 'telegram':
      return <Send className={`${className} text-[hsl(var(--primary))] drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} />;
    
    case 'youtube':
      return <Youtube className={`${className} text-red-500 drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} />;
    
    case 'instagram':
      return <Instagram className={`${className} text-pink-500 drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} />;
    
    case 'discord':
      return <MessageCircle className={`${className} text-indigo-500 drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} />;
    
    case 'reddit':
      return (
        <svg className={`${className} text-orange-500 drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
        </svg>
      );
    
    case 'facebook':
      return (
        <svg className={`${className} text-blue-600 drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      );
    
    case 'linkedin':
      return (
        <svg className={`${className} text-blue-700 drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      );
    
    case 'github':
      return <Github className={`${className} text-gray-400 drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} />;
    
    case 'medium':
      return (
        <svg className={`${className} text-gray-400 drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M13.54 12a6.8 6.8 0 01-6.77 6.82A6.8 6.8 0 010 12a6.8 6.8 0 016.77-6.82A6.8 6.8 0 0113.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.39-2.88-3.39-6.42s1.52-6.42 3.39-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/>
        </svg>
      );
    
    case 'twitch':
      return (
        <svg className={`${className} text-purple-500 drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/>
        </svg>
      );
    
    case 'website':
    default:
      return <Globe className={`${className} text-[hsl(var(--primary))] drop-shadow-[0_1px_3px_hsl(var(--primary)/0.5)]`} />;
  }
}

// Export DexScreener icon separately
export function DexScreenerIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <img 
      src={dexscreenerIcon} 
      alt="DexScreener" 
      className={`${className} ${iconImageStyle} rounded`}
    />
  );
}

// Export icon image for external use
export { dexscreenerIcon, xIcon, tiktokIcon };
