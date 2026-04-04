import { ExternalLink, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DebuggerTool {
  platform: string;
  name: string;
  url: string;
  notes: string;
}

const DEBUGGER_TOOLS: DebuggerTool[] = [
  { platform: 'Facebook', name: 'Sharing Debugger', url: 'https://developers.facebook.com/tools/debug/', notes: 'Paste URL → "Scrape Again" to refresh OG cache' },
  { platform: 'Twitter / X', name: 'Card Validator', url: 'https://cards-dev.twitter.com/validator', notes: 'Deprecated — post a tweet with the URL to force re-scrape' },
  { platform: 'LinkedIn', name: 'Post Inspector', url: 'https://www.linkedin.com/post-inspector/', notes: 'Paste URL → "Inspect" to force OG re-fetch' },
  { platform: 'Telegram', name: 'Webpage Bot', url: 'https://t.me/webpagebot', notes: 'Send the URL to @webpagebot to refresh Instant View cache' },
  { platform: 'Discord', name: 'Embed Refresh', url: 'https://discord.com/', notes: 'Append ?v=123 to URL, or wait ~15 min for auto-refresh' },
  { platform: 'Pinterest', name: 'Rich Pin Validator', url: 'https://developers.pinterest.com/tools/url-debugger/', notes: 'Validates and refreshes Rich Pin metadata' },
  { platform: 'Reddit', name: 'Link Preview', url: 'https://www.reddit.com/submit', notes: 'Submit link — Reddit caches previews for ~1h, add ?v= to bust' },
  { platform: 'WhatsApp', name: 'Cache Clear', url: 'https://wa.me/', notes: 'WhatsApp caches OG for ~72h. Append ?v=timestamp to force refresh' },
  { platform: 'Threads', name: 'Preview Refresh', url: 'https://www.threads.net/', notes: 'Uses same OG cache as Instagram — re-scrape via FB Debugger' },
  { platform: 'Google', name: 'Rich Results Test', url: 'https://search.google.com/test/rich-results', notes: 'Tests structured data & OG for Google SERP previews' },
  { platform: 'Google', name: 'PageSpeed Insights', url: 'https://pagespeed.web.dev/', notes: 'Check if meta tags render for Googlebot' },
  { platform: 'Bing', name: 'Webmaster URL Inspector', url: 'https://www.bing.com/webmasters/tools/url-inspection', notes: 'Request re-index to refresh Bing cache' },
  { platform: 'Slack', name: 'Link Unfurling', url: 'https://api.slack.com/docs/message-link-unfurling', notes: 'Slack caches ~30 min. Append ?v= param to bust cache' },
  { platform: 'iMessage', name: 'Link Preview', url: 'https://search.developer.apple.com/appsearch-validation-tool/', notes: 'Apple caches aggressively — versioned URLs help' },
  { platform: 'Mastodon', name: 'Link Preview', url: 'https://mastodon.social/', notes: 'Each instance caches separately. Edit toot to force re-fetch' },
  { platform: 'Bluesky', name: 'Card Debug', url: 'https://bsky.app/', notes: 'Bluesky fetches OG at post time — no separate debugger yet' },
  { platform: 'TikTok', name: 'Bio Link Preview', url: 'https://www.tiktok.com/', notes: 'TikTok caches bio link OG — update ?v= to refresh' },
  { platform: 'Snapchat', name: 'Story Links', url: 'https://developers.snap.com/', notes: 'Preview cached at story creation — no public debugger' },
  { platform: 'Tumblr', name: 'Link Preview', url: 'https://www.tumblr.com/', notes: 'Fetches OG at post time. Re-paste link to refresh.' },
  { platform: 'Medium', name: 'Import Preview', url: 'https://medium.com/', notes: 'Uses OG tags for link cards — caches ~1h' },
  { platform: 'Pocket', name: 'Parser API', url: 'https://getpocket.com/developer/', notes: 'Pocket parses OG on save — re-save to refresh' },
  { platform: 'LINE', name: 'URL Preview', url: 'https://developers.line.biz/', notes: 'LINE caches OG ~24h. No public debugger available.' },
  { platform: 'WeChat', name: 'Link Preview', url: 'https://developers.weixin.qq.com/', notes: 'WeChat requires whitelisted domains for custom previews' },
  { platform: 'Viber', name: 'URL Preview', url: 'https://www.viber.com/', notes: 'Viber fetches OG at send time. No cache-bust tool.' },
  { platform: 'Open Graph', name: 'OG Debugger (opengraph.xyz)', url: 'https://www.opengraph.xyz/', notes: 'Universal OG preview — shows exactly what crawlers see' },
];

export function CacheBustingTools() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <RotateCcw className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Social Platform Cache Debuggers</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Use these tools to force-refresh OG metadata after editing articles. Each link opens in a new tab.
      </p>
      <div className="grid grid-cols-1 gap-1.5 max-h-[70vh] overflow-y-auto pr-1">
        {DEBUGGER_TOOLS.map((tool) => (
          <a
            key={tool.url + tool.platform}
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-3 p-2.5 rounded-lg border border-border/50 hover:border-primary/40 hover:bg-muted/30 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-foreground">{tool.platform}</span>
                <span className="text-[10px] text-muted-foreground">— {tool.name}</span>
              </div>
              <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-snug">{tool.notes}</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary shrink-0 mt-0.5" />
          </a>
        ))}
      </div>
    </div>
  );
}
