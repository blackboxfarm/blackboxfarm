import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';

interface Platform {
  name: string;
  url: string;
  depth: string;
  category: string;
  notes: string;
}

const PLATFORMS: Platform[] = [
  // Article / Blog — 75%
  { name: 'Medium', url: 'https://medium.com', depth: '75%', category: 'Article / Blog', notes: 'High SEO, free to publish, partner program' },
  { name: 'HackerNoon', url: 'https://hackernoon.com', depth: '75%', category: 'Article / Blog', notes: 'Tech/crypto audience, strong domain authority' },
  { name: 'Mirror.xyz', url: 'https://mirror.xyz', depth: '75%', category: 'Article / Blog', notes: 'Web3-native, on-chain publishing' },
  { name: 'Publish0x', url: 'https://publish0x.com', depth: '75%', category: 'Article / Blog', notes: 'Crypto blog, tip-to-earn model' },
  { name: 'Hashnode', url: 'https://hashnode.com', depth: '75%', category: 'Article / Blog', notes: 'Dev-focused, custom domain support' },
  { name: 'DEV.to', url: 'https://dev.to', depth: '75%', category: 'Article / Blog', notes: 'Developer community, high engagement' },
  { name: 'Vocal.media', url: 'https://vocal.media', depth: '75%', category: 'Article / Blog', notes: 'General audience, monetization challenges' },
  { name: 'Substack', url: 'https://substack.com', depth: '75%', category: 'Article / Blog', notes: 'Newsletter-first, paid subscription option' },

  // Paid / Syndication — 50%
  { name: 'Twitter/X Articles', url: 'https://x.com', depth: '50%', category: 'Paid / Syndication', notes: 'Long-form articles feature' },
  { name: 'Fiverr Repost', url: 'https://fiverr.com', depth: '50%', category: 'Paid / Syndication', notes: 'Hire writers to repost on their blogs' },
  { name: 'Contently', url: 'https://contently.com', depth: '50%', category: 'Paid / Syndication', notes: 'Content marketplace for syndication' },
  { name: 'Scripted', url: 'https://scripted.com', depth: '50%', category: 'Paid / Syndication', notes: 'Freelance content platform' },
  { name: 'Benzinga', url: 'https://benzinga.com', depth: '50%', category: 'Paid / Syndication', notes: 'Finance contributor program (paid)' },
  { name: 'Flipboard', url: 'https://flipboard.com', depth: '50%', category: 'Paid / Syndication', notes: 'Content aggregator, magazine-style' },
  { name: 'Mix.com', url: 'https://mix.com', depth: '50%', category: 'Paid / Syndication', notes: 'StumbleUpon successor, content discovery' },

  // Short-form / Forums — 25%
  { name: 'Reddit', url: 'https://reddit.com', depth: '25%', category: 'Short-form / Forums', notes: 'r/cryptocurrency, r/solana, r/defi' },
  { name: 'Quora', url: 'https://quora.com', depth: '25%', category: 'Short-form / Forums', notes: 'Answer questions with backlinks' },
  { name: 'BitcoinTalk', url: 'https://bitcointalk.org', depth: '25%', category: 'Short-form / Forums', notes: 'OG crypto forum, high domain authority' },
  { name: 'CryptoTalk.org', url: 'https://cryptotalk.org', depth: '25%', category: 'Short-form / Forums', notes: 'Crypto discussion forum' },
  { name: 'Threads', url: 'https://threads.net', depth: '25%', category: 'Short-form / Forums', notes: 'Meta short-form, growing audience' },

  // Social / Micro — 25%
  { name: 'LinkedIn', url: 'https://linkedin.com', depth: '50%', category: 'Social', notes: 'Professional audience, article + post formats' },
  { name: 'Telegram Channel', url: 'https://telegram.org', depth: '25%', category: 'Social', notes: 'Broadcast channel for teasers' },
  { name: 'Mastodon', url: 'https://mastodon.social', depth: '25%', category: 'Social', notes: 'Decentralized, tech-savvy audience' },
  { name: 'Bluesky', url: 'https://bsky.app', depth: '25%', category: 'Social', notes: 'Growing alt-Twitter, AT Protocol' },

  // Crypto Media — Guest / Contributor
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com', depth: '75%', category: 'Crypto Media', notes: 'Guest contributor program' },
  { name: 'BeInCrypto', url: 'https://beincrypto.com', depth: '75%', category: 'Crypto Media', notes: 'Guest posts accepted' },
  { name: 'CryptoSlate', url: 'https://cryptoslate.com', depth: '75%', category: 'Crypto Media', notes: 'Press releases & guest articles' },
  { name: 'NewsBTC', url: 'https://newsbtc.com', depth: '50%', category: 'Crypto Media', notes: 'Sponsored / contributor content' },
  { name: 'Blockonomi', url: 'https://blockonomi.com', depth: '75%', category: 'Crypto Media', notes: 'Educational crypto content' },
  { name: 'AMBCrypto', url: 'https://ambcrypto.com', depth: '50%', category: 'Crypto Media', notes: 'Analysis-focused, contributor slots' },

  // Visual / Video
  { name: 'YouTube', url: 'https://youtube.com', depth: '50%', category: 'Visual / Video', notes: 'Script from condensed article → video' },
  { name: 'TikTok', url: 'https://tiktok.com', depth: '25%', category: 'Visual / Video', notes: 'Hook + 1 insight teaser format' },
  { name: 'Instagram', url: 'https://instagram.com', depth: '25%', category: 'Visual / Video', notes: 'Infographic carousels from key stats' },
];

const DEPTH_COLORS: Record<string, string> = {
  '75%': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  '50%': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  '25%': 'bg-red-500/20 text-red-400 border-red-500/30',
};

const CATEGORY_ORDER = [
  'Article / Blog',
  'Crypto Media',
  'Paid / Syndication',
  'Social',
  'Short-form / Forums',
  'Visual / Video',
];

export function PlatformsCheatSheet() {
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    platforms: PLATFORMS.filter(p => p.category === cat),
  }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Quick-reference of platforms for distributing condensed articles. Click any name to open the platform.
      </p>
      {grouped.map(g => (
        <Card key={g.category}>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">{g.category}</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 pt-0">
            <div className="divide-y divide-border/50">
              {g.platforms.map(p => (
                <div key={p.name} className="flex items-center gap-3 py-2 text-sm">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline flex items-center gap-1 min-w-[130px] shrink-0"
                  >
                    {p.name}
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </a>
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${DEPTH_COLORS[p.depth] || ''}`}>
                    {p.depth}
                  </Badge>
                  <span className="text-xs text-muted-foreground truncate">{p.notes}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
