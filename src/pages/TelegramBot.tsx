import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SocialIcon } from '@/components/token/SocialIcon';
import { SiteLayout } from '@/components/layout/SiteLayout';
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
  Coins,
  Settings,
  Monitor,
  Smartphone,
  Server,
} from 'lucide-react';
import { Separator } from '@/components/ui/separator';

const commands = [
  {
    cmd: '/holders',
    desc: 'Holder distribution analysis with tier breakdowns & ASCII charts',
    tier: 'Auth ★',
    tierColor: 'text-green-400',
    detail: 'Lite for free accounts • Full for X Subscribers+',
  },
  {
    cmd: '/risk',
    desc: 'AI risk & stability assessment with network behavior analysis',
    tier: 'Auth ★',
    tierColor: 'text-green-400',
    detail: '🟢/🔴 for free • Full analysis for X Subscribers+',
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

const riskSignals = [
  { emoji: '🟢', label: 'STRONG NETWORK', desc: 'Healthy holder distribution, stable wallet behavior, and positive developer history. Signals indicate a strong and stable token structure.', color: 'text-green-400' },
  { emoji: '🟢', label: 'MODERATE STRENGTH', desc: 'Reasonable holder distribution and acceptable developer signals. Some positive indicators, though network concentration or momentum may be mixed.', color: 'text-green-400' },
  { emoji: '🟡', label: 'SPECULATIVE NETWORK', desc: 'High volatility or uneven holder distribution detected. Token structure shows speculative characteristics and elevated uncertainty.', color: 'text-yellow-400' },
  { emoji: '🔴', label: 'HIGH RISK', desc: 'Network analysis detects potential warning signals such as concentrated holders, developer risk flags, or active distribution events.', color: 'text-red-400' },
];

export default function TelegramBot() {
  useEffect(() => {
    document.title = 'Telegram Bot — Holders Intel AI';
  }, []);

  return (
    <SiteLayout>
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

            {/* Account Linking Info */}
            <div className="mt-8 max-w-xl mx-auto rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm p-5 text-left space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Shield className="w-4 h-4 text-primary" />
                Private Account Linking
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The Holders Intel Bot links securely with your Telegram account using a unique <span className="text-foreground font-medium">Bot Registration Code</span> from your{' '}
                <Link to="/dashboard" className="text-primary hover:underline">Account Dashboard</Link>. 
                No personal data is shared — just a private code to unlock your tier.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Different subscription levels unlock different command tiers, from free quick scans to full AI narrative reports and dev reputation analysis.{' '}
                <Link to="/subscriptions" className="text-primary hover:underline">View available tiers →</Link>
              </p>
              <div className="pt-1">
                <Button size="sm" className="gap-2" asChild>
                  <a href="#channel-admins">
                    <Crown className="w-3.5 h-3.5" />
                    Channel Admins Info
                  </a>
                </Button>
              </div>
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

      {/* Risk System */}
      <section className="mx-auto max-w-5xl px-4 pb-16">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">The <code className="text-primary">/risk</code> System</h2>
          <p className="text-sm text-muted-foreground max-w-2xl mx-auto">
            AI evaluates holder distribution, wallet network behavior, developer history, and market momentum to generate a risk and stability assessment for each token.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2 max-w-xl mx-auto">
            These indicators help users quickly understand token health and network behavior.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
          {riskSignals.map((v) => (
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
                /holders (lite) & /risk (🟢/🔴) — 3 lookups/hour
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
                Full /holders, /momentum, /risk analysis, /alerts — 10 lookups/hour
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

      {/* For Group & Channel Admins */}
      <section id="channel-admins" className="mx-auto max-w-5xl px-4 pb-16 scroll-mt-20">
        <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-amber-500" />
              For Group & Channel Admins
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              Supercharge your crypto community with real-time holder analysis. Install the Holders Bot 
              in your Telegram Group or Channel and give your members instant access to token due diligence.
            </p>
            
            <div className="grid md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  Community Benefits
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Members can verify tokens before buying</li>
                  <li>• Reduce scam victims in your community</li>
                  <li>• Add value that sets your group apart</li>
                  <li>• Real-time analysis without leaving Telegram</li>
                </ul>
              </div>
              
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-blue-500" />
                  How It Works
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Any member posts a token address</li>
                  <li>• Bot replies with holder analysis</li>
                  <li>• Shows distribution, risks, and health score</li>
                  <li>• Links to full report on BlackBox Farm</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <Settings className="h-4 w-4 text-primary" />
                  Granular Config
                </h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• <span className="text-foreground font-medium">/delay</span> — set response delay (ms) so standard bots (Phanes, Skeleton, etc.) fire first</li>
                  <li>• Toggle commands for members vs. admins only</li>
                  <li>• Switch between long-form and short-form replies per command</li>
                  <li>• Control which analysis tiers are available in your group</li>
                  <li>• <span className="text-foreground font-medium">🚨 Dev Wallet Alerts</span> — get notified when a known creator launches a new token, with reputation score &amp; rug history</li>
                </ul>
              </div>
            </div>

            {/* Pricing */}
            <div className="bg-background/50 rounded-lg p-4 border">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    <Coins className="h-4 w-4 text-primary" />
                    One-Time Installation Fee
                  </h4>
                  <p className="text-sm text-muted-foreground">Lifetime access for your group/channel</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">0.25 SOL</div>
                  <p className="text-xs text-muted-foreground">No monthly fees</p>
                </div>
              </div>
            </div>

            {/* Anchor Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => document.getElementById('dm-management')?.scrollIntoView({ behavior: 'smooth' })}>
                <Monitor className="h-3.5 w-3.5" />
                DM-Only Channel Management
              </Button>
              <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => document.getElementById('dm-config-flow')?.scrollIntoView({ behavior: 'smooth' })}>
                <Smartphone className="h-3.5 w-3.5" />
                DM Config Flow
              </Button>
              <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => document.getElementById('channel-config-model')?.scrollIntoView({ behavior: 'smooth' })}>
                <Server className="h-3.5 w-3.5" />
                Channel Config Model
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ══════ DM-Only Channel Management ══════ */}
      <section id="dm-management" className="mx-auto max-w-5xl px-4 pb-12 scroll-mt-20">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              DM-Only Channel Management
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              All channel admin config happens in DM with the bot — never in public groups.
              No admin commands are exposed in-channel. This keeps groups clean and prevents config leaks.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { cmd: '/add', desc: 'Add bot to a channel/group', detail: 'Guides subscriber through adding bot to a channel. Bot generates invite link or instructs user to add @holdersintel_bot as admin. Once added, bot detects the group and registers it in channel_installations.', note: 'DM only. Any registered user can install bot in channels.' },
              { cmd: '/channels', aliases: '/ch', desc: 'List & manage installed channels', detail: 'Shows numbered list of all channels this user has the bot installed in, with status (✅ paid / ⏳ unpaid / 🚫 kicked). User taps a number to enter config mode for that channel.', note: 'DM only. Entry point for all per-channel config.' },
              { cmd: '/config', desc: 'Configure selected channel settings', detail: 'After selecting a channel via /channels, shows interactive config menu with inline keyboard buttons: Delay (ms), Verbose On/Off, Admin-Only On/Off, Dev Alerts On/Off, Toggle Commands, Set Max Tier, Auto-CA On/Off. Each button updates admin_config and confirms.', note: 'DM only. Uses Telegram inline keyboard for interactive config.' },
              { cmd: '/payment', aliases: '/pay', desc: 'View/generate SOL payment wallet', detail: 'Shows SOL wallet address for selected channel. If none exists, generates one. Displays: wallet address (copyable), required amount (0.25 SOL), current balance, payment status.', note: 'DM only. Wallet generated per channel_installations row.' },
            ].map(item => (
              <div key={item.cmd} className="bg-muted/30 rounded-lg p-4 border border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-sm font-bold text-primary">{item.cmd}</code>
                  {item.aliases && <span className="text-xs text-muted-foreground">({item.aliases})</span>}
                  <Badge variant="outline" className="text-[9px] ml-auto border-blue-500/30 text-blue-400">DM only</Badge>
                </div>
                <p className="text-xs font-medium text-foreground mb-1">{item.desc}</p>
                <p className="text-xs text-muted-foreground">{item.detail}</p>
                {item.note && <p className="text-[10px] text-muted-foreground/70 mt-1 italic">{item.note}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* ══════ DM Config Flow ══════ */}
      <section id="dm-config-flow" className="mx-auto max-w-5xl px-4 pb-12 scroll-mt-20">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-primary" />
              DM Config Flow (User Experience)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-muted-foreground">
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-foreground mb-1">Step 1: /add</p>
                  <div className="bg-muted/30 rounded p-2 text-[10px] space-y-1 border border-border/50">
                    <p>User: <code className="text-primary">/add</code></p>
                    <p>Bot: "Add me as admin to your channel/group, then send me the group name or forward a message from it."</p>
                    <p>User: <em>adds bot to "Solana Alpha Chat"</em></p>
                    <p>Bot: "✅ Detected! I'm now in <strong className="text-foreground">Solana Alpha Chat</strong> (ID: -100xxx). Use /channels to manage it."</p>
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">Step 2: /channels</p>
                  <div className="bg-muted/30 rounded p-2 text-[10px] space-y-1 border border-border/50">
                    <p>User: <code className="text-primary">/channels</code></p>
                    <p>Bot:</p>
                    <p className="pl-2">📡 Your Channels:</p>
                    <p className="pl-2">1️⃣ Solana Alpha Chat — ⏳ Unpaid</p>
                    <p className="pl-2">2️⃣ Degen Traders — ✅ Active</p>
                    <p className="pl-2"><em>Tap a number to configure</em></p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="font-semibold text-foreground mb-1">Step 3: Select → /config</p>
                  <div className="bg-muted/30 rounded p-2 text-[10px] space-y-1 border border-border/50">
                    <p>User taps: <code className="text-primary">1</code></p>
                    <p>Bot shows inline keyboard:</p>
                    <p className="pl-2 font-mono">⚙️ Config: Solana Alpha Chat</p>
                    <p className="pl-2 font-mono">[⏱ Delay: 0ms] [📝 Verbose: Off]</p>
                    <p className="pl-2 font-mono">[🔒 Admin-Only: Off] [🚨 Dev Alerts: Off]</p>
                    <p className="pl-2 font-mono">[📋 Toggle Commands] [📊 Max Tier: Auto]</p>
                    <p className="pl-2 font-mono">[💳 Payment Status]</p>
                  </div>
                </div>
                <div>
                  <p className="font-semibold text-foreground mb-1">Step 4: Inline Button Taps</p>
                  <div className="bg-muted/30 rounded p-2 text-[10px] space-y-1 border border-border/50">
                    <p>User taps <code className="text-primary">[⏱ Delay: 0ms]</code></p>
                    <p>Bot: "Enter delay in ms (e.g. 3000):"</p>
                    <p>User: <code className="text-primary">3000</code></p>
                    <p>Bot: "✅ Delay set to 3000ms for Solana Alpha Chat"</p>
                    <p className="italic mt-1">Returns to config menu</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ══════ Channel Config Model ══════ */}
      <section id="channel-config-model" className="mx-auto max-w-5xl px-4 pb-16 scroll-mt-20">
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="h-4 w-4 text-primary" />
              Channel Installation & Config Model
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              One-time 0.25 SOL activation per channel. All management via DM — no admin commands in groups.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-muted/30 rounded-lg p-4 space-y-2 border border-border/50">
                <h4 className="text-sm font-semibold text-foreground">💳 Activation Flow</h4>
                <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
                  <li>User creates website account & registers with bot via DM</li>
                  <li>User runs <code className="text-foreground font-mono">/add</code> in DM</li>
                  <li>Adds bot as admin to their channel/group</li>
                  <li>Bot auto-detects and registers the installation</li>
                  <li>User runs <code className="text-foreground font-mono">/channels</code> → selects channel</li>
                  <li>Taps <code className="text-foreground font-mono">[💳 Payment]</code> → gets SOL wallet</li>
                  <li>Sends 0.25 SOL → taps "Verify Payment"</li>
                  <li>Bot activates in that channel ✅</li>
                </ol>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 space-y-2 border border-border/50">
                <h4 className="text-sm font-semibold text-foreground">⚙️ Per-Channel Config (via DM)</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• <span className="text-foreground font-mono">Delay</span> — response delay so other bots fire first</li>
                  <li>• <span className="text-foreground font-mono">Verbose</span> — long-form vs short-form replies</li>
                  <li>• <span className="text-foreground font-mono">Admin-Only</span> — restrict commands to group admins</li>
                  <li>• <span className="text-foreground font-mono">Dev Alerts</span> — 🚨 new token launch alerts</li>
                  <li>• <span className="text-foreground font-mono">Toggle Commands</span> — enable/disable per command</li>
                  <li>• <span className="text-foreground font-mono">Max Tier</span> — cap analysis depth in channel</li>
                  <li>• All config via inline keyboard in DM, never in-channel</li>
                </ul>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 space-y-2 border border-border/50">
                <h4 className="text-sm font-semibold text-foreground">📋 Rules</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Kicked bots can be re-added, no re-charge</li>
                  <li>• One account can manage many channels</li>
                  <li>• No refunds — lifetime activation</li>
                  <li>• In-channel: only analysis commands (per config)</li>
                  <li>• DM: personal access + channel management</li>
                  <li>• No admin commands exposed in public groups</li>
                  <li>• Dashboard also shows channels (read/pay)</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </SiteLayout>
  );
}
