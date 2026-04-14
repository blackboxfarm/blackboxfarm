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
  /** Article slug — used to build the OG proxy URL for platforms that unfurl */
  slug?: string;
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
    getUrl: (url: string, title: string, desc?: string) =>
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
    useOgUrl: true,
    getUrl: (url: string, title: string) =>
      `https://www.threads.net/intent/post?text=${encodeURIComponent(title + '\n' + url)}`,
    color: 'hover:text-foreground',
  },
  {
    name: 'Telegram',
    icon: Send,
    useOgUrl: true,
    getUrl: (url: string, title: string, desc?: string) => {
      const text = `📰 ${title}`;
      return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    },
    color: 'hover:text-sky-500',
  },
  {
    name: 'Discord',
    icon: () => (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z" />
      </svg>
    ),
    useOgUrl: true,
    // Discord has no share URL — handled as clipboard copy in the component
    isClipboard: true,
    getClipboardText: (url: string, title: string, desc?: string) =>
      `📰 **${title}**${desc ? `\n> ${desc}` : ''}\n${url}`,
    getUrl: () => '',
    color: 'hover:text-indigo-400',
  },
  {
    name: 'WhatsApp',
    icon: MessageCircle,
    useOgUrl: true,
    getUrl: (url: string, title: string, desc?: string) => {
      const text = `📰 *${title}*${desc ? `\n\n_${desc}_` : ''}\n\n🔗 ${url}`;
      return `https://wa.me/?text=${encodeURIComponent(text)}`;
    },
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
    getUrl: (url: string, title: string, desc?: string) =>
      `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}${desc ? `&text=${encodeURIComponent(desc)}` : ''}`,
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
    getUrl: (url: string, title: string, desc?: string) =>
      `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(title + (desc ? ' — ' + desc : ''))}`,
    color: 'hover:text-red-500',
  },
  {
    name: 'Email',
    icon: Mail,
    useOgUrl: false,
    getUrl: (url: string, title: string, desc?: string) => {
      const body = [
        `I thought you'd find this interesting:`,
        '',
        `📰 ${title}`,
        desc ? `\n${desc}` : '',
        '',
        `Read the full article:`,
        url,
        '',
        `— Shared from Blackbox.farm Intel Briefings`,
      ].filter(Boolean).join('\n');
      return `mailto:?subject=${encodeURIComponent(`Worth a read: ${title}`)}&body=${encodeURIComponent(body)}`;
    },
    color: 'hover:text-amber-500',
  },
];

export function SocialShareBar({ url, title, description, slug }: SocialShareBarProps) {
  const [copied, setCopied] = useState(false);
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const cacheBust = encodeURIComponent(`${slug || title}-${Date.now()}`);
  const ogProxyUrl = slug && supabaseUrl
    ? `${supabaseUrl}/functions/v1/intel-share?slug=${encodeURIComponent(slug)}&v=${cacheBust}`
    : url;
  const copyableUrl = slug ? ogProxyUrl : url;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(copyableUrl);
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
          const shareUrl = (p as any).useOgUrl ? ogProxyUrl : url;

          // Discord: copy formatted message to clipboard
          if ((p as any).isClipboard) {
            return (
              <Button
                key={p.name}
                variant="ghost"
                size="icon"
                className={`h-9 w-9 rounded-full text-muted-foreground transition-colors ${p.color}`}
                title={`Copy for ${p.name}`}
                onClick={async () => {
                  const text = (p as any).getClipboardText(shareUrl, title, description);
                  await navigator.clipboard.writeText(text);
                  toast.success('Copied for Discord — paste into any channel!');
                }}
              >
                <Icon className="h-4 w-4" />
              </Button>
            );
          }

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
