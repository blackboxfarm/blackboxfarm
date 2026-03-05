import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SocialIcon } from '@/components/token/SocialIcon';
import {
  MessageCircle,
  ArrowRight,
  Crown,
  Sparkles,
  Zap,
  Shield,
  BarChart3,
  Search,
  Bell,
  ExternalLink,
  Lock,
  ChevronRight,
} from 'lucide-react';

const commands = [
  {
    cmd: '/holders',
    desc: 'Holder distribution analysis with tier breakdowns & ASCII charts',
    tier: 'Auth ★',
    tierColor: 'text-green-400',
    detail: 'Lite for free accounts • Full for X Subscribers+',
  },
  {
    cmd: '/verdict',
    desc: 'Instant Buy/Hold signal with position sizing recommendations',
    tier: 'Auth ★',
    tierColor: 'text-green-400',
    detail: '🟢/🔴 for free • Full sizing for X Subscribers+',
  },
  {
    cmd: '/momentum',
    desc: 'Live volume, price action & momentum scoring from DexScreener',
    tier: 'X Sub ★★',
    tierColor: 'text-blue-400',
  },
  {
    cmd: '/oracle',
    desc: 'Developer reputation lookup — wallet history, rug risk, trust score',
    tier: 'Pro ★★★',
    tierColor: 'text-yellow-400',
  },
  {
    cmd: '/wallet',
    desc: 'Deep wallet behavior analysis — trading patterns, PnL, clustering',
    tier: 'Pro ★★★',
    tierColor: 'text-yellow-400',
  },
  {
    cmd: '/alerts',
    desc: 'Configure whale movement & price alerts delivered to your DMs',
    tier: 'X Sub ★★',
    tierColor: 'text-blue-400',
  },
];

const verdictSignals = [
  { emoji: '🟢', label: 'BUY DEEP LONG', desc: 'Strong chart, healthy holders, good dev. Full position, hold.', color: 'text-green-400' },
  { emoji: '🟢', label: 'BUY MEDIUM SHORT', desc: 'Decent momentum. Medium position, 2x target.', color: 'text-green-400' },
  { emoji: '🟡', label: 'BUY SMALL SHORT', desc: 'Speculative. Disposable amount, quick 2x flip.', color: 'text-yellow-400' },
  { emoji: '🔴', label: 'HOLD / AVOID', desc: 'Weak signals, bad dev, or dump in progress. Skip.', color: 'text-red-400' },
];

export default function TelegramBot() {
  useEffect(() => {
    document.title = 'Telegram Bot — Holders Intel AI';
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-cyan-500/5" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_60%)]" />
        <div className="relative mx-auto max-w-5xl px-4 py-16 md:py-24">
          <div className="text-center space-y-5">
            <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5">
              <MessageCircle className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-400">Coming Soon</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                Holders Intel
              </span>
              <span className="text-foreground"> Bot</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              The full power of Holders Intel AI — right in your Telegram DMs.
              <br />
              <span className="text-foreground font-medium">Paste a contract address. Get instant alpha.</span>
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="lg" className="gap-2" disabled>
                <MessageCircle className="w-4 h-4" />
                Launch Bot (Coming Soon)
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/subscriptions">
                  View Plans <ChevronRight className="w-4 h-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Commands Grid */}
      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-2xl font-bold text-center mb-2">Bot Commands</h2>
        <p className="text-sm text-muted-foreground text-center mb-10">
          Access is gated by your subscription tier. Higher tiers unlock more commands & higher rate limits.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {commands.map((c) => (
            <Card key={c.cmd} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <code className="text-lg font-bold text-primary">{c.cmd}</code>
                  <Badge variant="outline" className={`text-xs ${c.tierColor} border-current`}>
                    {c.tier}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{c.desc}</p>
                {c.detail && (
                  <p className="text-xs text-muted-foreground/70 mt-1 italic">{c.detail}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Verdict System */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">The <code className="text-primary">/verdict</code> System</h2>
          <p className="text-sm text-muted-foreground">
            AI combines momentum + holder health + dev reputation into one actionable signal.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {verdictSignals.map((v) => (
            <div key={v.label} className="border border-border/50 rounded-lg p-4 bg-card/30">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">{v.emoji}</span>
                <span className={`font-bold text-sm ${v.color}`}>{v.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{v.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tier Access */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-2xl font-bold text-center mb-8">Unlock More With Your Tier</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/50">
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <Shield className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="font-bold">Free Account</h3>
              <p className="text-xs text-muted-foreground">
                /holders (lite) & /verdict (🟢/🔴) — 3 lookups/hour
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link to="/auth">Sign Up Free</Link>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-blue-500/30">
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="font-bold">X Subscriber</h3>
              <p className="text-xs text-muted-foreground">
                Full /holders, /momentum, /verdict sizing, /alerts — 10 lookups/hour
              </p>
              <Button variant="outline" size="sm" className="border-blue-500/30 text-blue-400" asChild>
                <a href="https://x.com/holdersintel" target="_blank" rel="noopener noreferrer">
                  <SocialIcon platform="twitter" className="w-3.5 h-3.5 mr-1" />
                  Subscribe on X
                </a>
              </Button>
            </CardContent>
          </Card>
          <Card className="border-primary/30">
            <CardContent className="p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Crown className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-bold">Pro+</h3>
              <p className="text-xs text-muted-foreground">
                Everything + /oracle, /wallet, advanced analysis — 25+ lookups/hour
              </p>
              <Button size="sm" asChild>
                <Link to="/subscriptions">
                  Upgrade <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-3xl px-4 pb-16 text-center space-y-4">
        <h2 className="text-xl font-bold">Ready to get alpha on the go?</h2>
        <p className="text-sm text-muted-foreground">
          The Telegram Bot is launching soon. Get the best experience by subscribing now — your tier carries over automatically.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link to="/subscriptions">
              View Subscription Plans <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <a href="https://x.com/holdersintel" target="_blank" rel="noopener noreferrer">
              <SocialIcon platform="twitter" className="w-4 h-4 mr-1" />
              Follow @holdersintel
              <ExternalLink className="w-3 h-3 ml-1" />
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
