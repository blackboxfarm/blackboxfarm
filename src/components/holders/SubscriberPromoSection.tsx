import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, ExternalLink, MessageSquare, Crown, Sparkles, Users } from 'lucide-react';
import { SocialIcon } from '@/components/token/SocialIcon';
import { XSuspendedPopover } from '@/components/XSuspendedPopover';

export function SubscriberPromoSection() {
  return (
    <div className="space-y-4">
      {/* Telegram Bot Promo */}
      <Card className="border-border/50 bg-gradient-to-br from-blue-500/5 via-background to-cyan-500/5 overflow-hidden">
        <CardContent className="py-5 px-4 md:px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
              <Bot className="h-6 w-6 text-blue-400" />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-foreground text-sm">@holdersintel_bot</h3>
                <Badge variant="outline" className="text-[10px] text-blue-300 border-blue-500/30 bg-blue-500/10">
                  Telegram Bot
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Get instant token analysis in Telegram. Subscribers unlock <span className="text-foreground font-medium">/risk</span>, <span className="text-foreground font-medium">/dev</span>, <span className="text-foreground font-medium">/oracle</span> commands — the same intel from this page, available wherever you trade.
              </p>
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground pt-1">
                <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> DM &amp; Group Chat</span>
                <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI Risk Reports</span>
                <span className="flex items-center gap-1"><Crown className="h-3 w-3 text-yellow-400" /> Pro Commands</span>
              </div>
            </div>
            <a href="https://t.me/holdersintel_bot" target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Bot className="h-3.5 w-3.5" />
                Try Bot
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* X Subscriber Community Promo */}
      <Card className="border-border/50 bg-gradient-to-br from-primary/5 via-background to-primary/3 overflow-hidden">
        <CardContent className="py-5 px-4 md:px-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
              <SocialIcon platform="twitter" className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-foreground text-sm">Subscribers X Community</h3>
                <Badge variant="outline" className="text-[10px] text-primary border-primary/30 bg-primary/10">
                  <Crown className="h-2.5 w-2.5 mr-0.5" /> Exclusive
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pro subscribers get access to our private X Community with <span className="text-foreground font-medium">real-time alerts</span>, <span className="text-foreground font-medium">full Dev Reputation scores</span>, and <span className="text-foreground font-medium">early intel</span> — while the public feed only gets highlights.
              </p>
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground pt-1">
                <span className="flex items-center gap-1"><Users className="h-3 w-3" /> Subscriber Only</span>
                <span className="flex items-center gap-1"><Sparkles className="h-3 w-3" /> Full Intel Tweets</span>
                <span className="flex items-center gap-1"><Crown className="h-3 w-3 text-yellow-400" /> Dev Rep Scores</span>
              </div>
            </div>
            <XSuspendedPopover>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <SocialIcon platform="twitter" className="h-3.5 w-3.5" />
                Follow
                <ExternalLink className="h-3 w-3" />
              </Button>
            </XSuspendedPopover>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
