import { 
  Facebook, Twitter, Mail, Link2, MessageCircle, Send, 
  Linkedin, Copy, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';

interface SocialShareBarProps {
  url: string;
  title: string;
  description?: string;
  /** Dedicated share endpoint URL for OG-dependent platforms */
  ogShareUrl?: string;
}

/**
 * Build the intel-share edge function URL for a given article slug.
 * Includes a cache-bust param so FB/LinkedIn re-scrape after edits.
 */
export function buildIntelShareUrl(slug: string, updatedAt?: string | null): string {
  const base = `https://apxauapuusmgwbbzjgfl.supabase.co/functions/v1/intel-share?slug=${encodeURIComponent(slug)}`;
  if (updatedAt) {
    return `${base}&v=${new Date(updatedAt).getTime()}`;
  }
  return base;
}

const platforms = [
  {
    name: 'X (Twitter)',
    icon: Twitter,
    // Twitter has its own card crawler, but it also respects OG — use ogShareUrl
    useOgUrl: true,
    getUrl: (url: string, title: string) =>
      `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    color: 'hover:text-sky-400',
  },
  {
    name: 'Facebook',
    icon: Facebook,
    useOgUrl: true,
    getUrl: (url: string) =>
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    color: 'hover:text-blue-500',
  },
  {
    name: 'LinkedIn',
    icon: Linkedin,
    useOgUrl: true,
    getUrl: (url: string, title: string) =>
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    color: 'hover:text-blue-600',
  },
  {
    name: 'Threads',
    icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.59 12c.025 3.086.718 5.496 2.057 7.164 1.432 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.276 3.26-.887 1.108-2.168 1.725-3.659 1.725-1.074 0-2.03-.317-2.766-.917-.894-.729-1.378-1.787-1.364-2.981.024-2.109 1.636-3.527 4.003-3.527.895 0 1.683.177 2.349.398l-.034-1.67c-.009-.438-.03-.876-.074-1.31l2.07-.12c.054.53.08 1.065.09 1.6l.038 1.895c1.064.648 1.87 1.564 2.328 2.726.762 1.94.688 4.627-1.397 6.668C16.932 23.176 14.67 23.975 12.186 24zm.09-8.886c-1.413 0-2.07.717-2.083 1.547-.01.557.222 1.02.636 1.356.384.312.913.477 1.483.477.894 0 1.587-.323 2.065-.96.412-.546.72-1.36.858-2.395-.596-.17-1.247-.284-1.922-.284l-.038.26z" />
      </svg>
    ),
    useOgUrl: false,
    getUrl: (url: string, title: string) =>
      `https://www.threads.net/intent/post?text=${encodeURIComponent(title + ' ' + url)}`,
    color: 'hover:text-foreground',
  },
  {
    name: 'Telegram',
    icon: Send,
    useOgUrl: false,
    getUrl: (url: string, title: string) =>
      `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    color: 'hover:text-sky-500',
  },
  {
    name: 'WhatsApp',
    icon: MessageCircle,
    useOgUrl: false,
    getUrl: (url: string, title: string) =>
      `https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`,
    color: 'hover:text-green-500',
  },
  {
    name: 'Reddit',
    icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
      </svg>
    ),
    useOgUrl: true,
    getUrl: (url: string, title: string) =>
      `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
    color: 'hover:text-orange-500',
  },
  {
    name: 'Pinterest',
    icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z" />
      </svg>
    ),
    useOgUrl: true,
    getUrl: (url: string, title: string) =>
      `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(title)}`,
    color: 'hover:text-red-500',
  },
  {
    name: 'Email',
    icon: Mail,
    useOgUrl: false,
    getUrl: (url: string, title: string, desc?: string) =>
      `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent((desc ? desc + '\n\n' : '') + url)}`,
    color: 'hover:text-amber-500',
  },
];

export function SocialShareBar({ url, title, description, ogShareUrl }: SocialShareBarProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Share this briefing
      </span>
      <div className="flex items-center gap-1 flex-wrap justify-center">
        {platforms.map((p) => {
          const Icon = p.icon;
          // OG-dependent platforms use the dedicated share URL when available
          const shareUrl = (p.useOgUrl && ogShareUrl) ? ogShareUrl : url;
          return (
            <Button
              key={p.name}
              variant="ghost"
              size="icon"
              className={`h-9 w-9 rounded-full text-muted-foreground transition-colors ${p.color}`}
              asChild
              title={`Share on ${p.name}`}
            >
              <a
                href={p.getUrl(shareUrl, title, description)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon className="h-4 w-4" />
              </a>
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full text-muted-foreground hover:text-primary transition-colors"
          onClick={copyLink}
          title="Copy link"
        >
          {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
