import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, Brain, Bot, Network, Eye, Lock, Zap, Users, 
  TrendingUp, Search, AlertTriangle, Globe, ArrowRight,
  CheckCircle2, XCircle, Star, Crown, Rocket, Target,
  MessageSquare, BarChart3, Fingerprint, ExternalLink, MessageCircle,
  Loader2
} from "lucide-react";
import { Link } from "react-router-dom";
import { SocialIcon } from "@/components/token/SocialIcon";
import holdersLogo from "@/assets/holders-logo.png";
import aiIntelEntity from "@/assets/ai-intel-entity.png";
import { SiteLayout } from "@/components/layout/SiteLayout";
import { XSuspendedPopover } from "@/components/XSuspendedPopover";
import { usePageTracking } from "@/hooks/usePageTracking";
import { TestimonialCarousel } from "@/components/testimonials/TestimonialCarousel";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { STRIPE_TIERS } from "@/config/stripeTiers";
import { AuthModal } from "@/components/auth/AuthModal";
import { toast } from "sonner";

const TIERS = [
  {
    name: "Free",
    icon: <Zap className="w-5 h-5" />,
    price: "Free",
    description: "Explore the basics. No account needed.",
    color: "border-muted-foreground/30",
    badge: "bg-muted text-muted-foreground",
    cta: { label: "Try Free Analysis", action: "navigate", to: "/holders" },
    features: [
      { name: "Basic Holder Breakdown", included: true },
      { name: "Top 25 Holders Table", included: true },
      { name: "Liquidity & Supply Stats", included: true },
      { name: "Stability Score", included: true },
      { name: "Telegram /quick command", included: true },
      { name: "AI Analysis", included: false },
      { name: "Bubble Map", included: false },
      { name: "Wallet Deep Scan", included: false },
    ]
  },
  {
    name: "Signed In",
    icon: <Users className="w-5 h-5" />,
    price: "Free",
    description: "Create an account to unlock more depth.",
    color: "border-primary/30",
    badge: "bg-primary/10 text-primary",
    cta: { label: "Sign Up Free", action: "navigate", to: "/subscriptions#plans" },
    features: [
      { name: "Everything in Free", included: true },
      { name: "Extended Analysis Panel", included: true },
      { name: "Security Alerts & Flags", included: true },
      { name: "Reputation Cross-Reference", included: true },
      { name: "Telegram /holders, /ca", included: true },
      { name: "AI Narrative Reports", included: false },
      { name: "Bubble Map (limited)", included: "partial" as const },
      { name: "Oracle Deep Scan", included: false },
    ]
  },
  {
    name: "X Subscriber",
    icon: <Star className="w-5 h-5" />,
    price: "$4.99/mo",
    description: "Subscribe via X for premium intel.",
    color: "border-primary/50",
    badge: "bg-primary/20 text-primary",
    cta: { label: "Subscribe on X", action: "external", to: "https://x.com/holdersintel" },
    features: [
      { name: "Everything in Signed In", included: true },
      { name: "AI Analysis & Risk Scores", included: true },
      { name: "Telegram /risk, /ai", included: true },
      { name: "Bubble Map (good access)", included: true },
      { name: "Dev Wallet Tracing", included: true },
      { name: "KYC Root Discovery", included: "partial" as const },
      { name: "Full Oracle Network", included: false },
      { name: "API Access", included: false },
    ]
  },
  {
    name: "Pro",
    icon: <Crown className="w-5 h-5" />,
    price: "$9.99/mo",
    description: "Full power. Every tool. Every signal.",
    color: "border-primary",
    badge: "bg-primary text-primary-foreground",
    highlight: true,
    cta: { label: "Upgrade to Pro", action: "checkout", to: "/subscriptions#plans" },
    features: [
      { name: "Everything in X Subscriber", included: true },
      { name: "Full AI Narrative Reports", included: true },
      { name: "Bubble Map (unlimited)", included: true },
      { name: "Oracle Deep + Spider Scan", included: true },
      { name: "KYC Root Network Mapping", included: true },
      { name: "Recycled Identity Detection", included: true },
      { name: "Full Telegram Bot Suite", included: true },
      { name: "Priority API Access", included: true },
    ]
  },
];

const PRODUCT_PILLARS = [
  {
    icon: <BarChart3 className="w-8 h-8 text-primary" />,
    title: "AI Holder Analysis",
    subtitle: "Deep intelligence on every token",
    description: "Real-time holder distribution analysis with AI-powered narratives. See who's holding, who's dumping, and what the smart money is doing.",
    features: [
      "Bagless holder detection & dust filtering",
      "Top 25 holder breakdown with wallet labels",
      "Stability scoring & concentration metrics",
      "Liquidity pool vs circulating supply analysis",
      "Reputation cross-reference against known bad actors",
      "RugCheck cluster analysis for bundled insiders",
    ],
    tier: "Free → Pro",
  },
  {
    icon: <Bot className="w-8 h-8 text-primary" />,
    title: "Telegram Bot",
    subtitle: "@holdersintel_bot — Intel on demand",
    description: "Query any Solana token directly from Telegram. Fast commands for traders, deep analysis for researchers, AI risk assessments for decision-makers.",
    features: [
      "/quick — Instant snapshot (free)",
      "/holders — Full holder breakdown",
      "/risk — AI-powered risk & stability assessment",
      "/ai — Deep narrative analysis",
      "/wallet — Dev wallet trace & history",
      "Group chat mode with abbreviated intel",
    ],
    tier: "Free → Pro",
  },
  {
    icon: <Network className="w-8 h-8 text-primary" />,
    title: "Bubble Map",
    subtitle: "The cherry on top",
    description: "A revolutionary interactive graph that maps the hidden connections between tokens, developers, wallets, socials, and KYC roots.",
    features: [
      "Token → Dev Wallet → Funder → KYC Root chains",
      "Token → X Community → Admin/Mod handles",
      "Recycled Telegram channel detection",
      "Recycled X account detection",
      "Bad actor database cross-reference",
      "Interactive expand, spider, and deep-trace",
    ],
    tier: "Signed In → Pro",
    isNew: true,
  },
];

const UNIQUE_SIGNALS = [
  {
    icon: <Fingerprint className="w-6 h-6" />,
    title: "Recycled Identity Detection",
    description: "We resolve mutable usernames to immutable IDs. When a scammer changes their X handle or Telegram channel name, we still know who they are.",
  },
  {
    icon: <AlertTriangle className="w-6 h-6" />,
    title: "Scammer-in-Possession Alerts",
    description: "Our top-20 holder scan cross-references against dev_wallet_reputation and pumpfun_blacklist. If a known rug-puller is holding your token, you'll know.",
  },
  {
    icon: <Eye className="w-6 h-6" />,
    title: "KYC Root Tracing",
    description: "3-depth recursive wallet scanning discovers master wallets linked to exchanges. Map the entire funding network from dev → funder → KYC root.",
  },
  {
    icon: <Shield className="w-6 h-6" />,
    title: "Cluster & Bundle Analysis",
    description: "RugCheck integration exposes coordinated wallet networks holding concentrated supply. Identify insider groups before they dump.",
  },
  {
    icon: <Globe className="w-6 h-6" />,
    title: "Social-to-Onchain Mapping",
    description: "Strict topology separates social entities from on-chain entities. Website, X community, and dev wallet chains branch independently from the token node.",
  },
  {
    icon: <Target className="w-6 h-6" />,
    title: "AI Risk Engine",
    description: "Multi-factor AI analysis considers holder distribution, dev reputation, liquidity depth, and social signals to deliver actionable risk assessments.",
  },
];

function FeatureCheck({ included }: { included: boolean | string }) {
  if (included === true) return <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />;
  if (included === "partial") return <Star className="w-4 h-4 text-muted-foreground shrink-0" />;
  return <XCircle className="w-4 h-4 text-muted-foreground/40 shrink-0" />;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  usePageTracking('home');

  const handleProCheckout = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    setCheckoutLoading(true);
    try {
      const priceId = STRIPE_TIERS.pro.price_id;
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <SiteLayout>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(180_100%_50%/0.08),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,hsl(180_100%_50%/0.04),transparent_50%)]" />
        
        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-20 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src={holdersLogo} alt="Holders Intel" className="w-12 h-12 md:w-16 md:h-16" />
            <h1 className="text-4xl md:text-6xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                Holders Intel
              </span>
            </h1>
          </div>
          
          <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-4 font-light">
            AI-Powered Token Intelligence · Telegram Bot · Bubble Map
          </p>
          
          <p className="text-sm md:text-base text-muted-foreground/70 max-w-2xl mx-auto mb-10">
            Crypto has hands — we show them. Deep holder analysis, wallet tracing, 
            social identity verification, and a revolutionary network graph that exposes 
            the connections others can't see.
           </p>

           <div className="max-w-2xl mx-auto mb-8 px-4">
             <p className="text-sm md:text-base text-muted-foreground/80 italic text-center leading-relaxed">
               "HoldersIntel" is your community tool chest to open the BlackBox of Crypto and see if the Coin is dead or Alive.
             </p>
             <p className="text-xs text-muted-foreground/50 text-right mt-1 pr-4">
               ~ Geekweek
             </p>
           </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button 
              size="lg" 
              onClick={() => navigate("/holders")}
              className="gap-2 shadow-glow"
            >
              <Rocket className="w-4 h-4" />
              Holders Analysis
            </Button>
            <a
              href="https://t.me/holdersintel_bot"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="lg" variant="outline" className="gap-2">
                🤖 HoldersIntel Bot
              </Button>
            </a>
            <Button 
              size="lg" 
              variant="outline"
              onClick={() => navigate("/bubblepromo")}
              className="gap-2"
            >
              🫧 BubbleMap
            </Button>
          </div>

          {/* Intelligence Promo Section */}
          <div className="mt-10 max-w-5xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center rounded-xl border border-primary/20 bg-gradient-to-br from-background via-primary/5 to-background p-6 md:p-8">
              {/* Left — AI Entity Image */}
              <div className="flex justify-center">
                <img 
                  src={aiIntelEntity} 
                  alt="BlackBox AI Intelligence Entity analyzing bubble map data" 
                  className="rounded-lg max-h-[420px] w-auto object-contain drop-shadow-[0_0_30px_hsl(var(--primary)/0.3)]"
                  loading="lazy"
                />
              </div>
              {/* Right — Blurbs */}
              <div className="space-y-5">
                <h2 className="text-xl md:text-2xl font-bold text-foreground">
                  Intelligence That Works While You Sleep
                </h2>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <span className="text-2xl shrink-0">🛡️</span>
                    <div>
                      <p className="font-semibold text-foreground">Smarter Rug Detection</p>
                      <p className="text-sm text-muted-foreground">Our intelligence engine scores developer behavior patterns, flagging repeat offenders and serial ruggers before they launch their next token. Bad actors can't hide behind fresh wallets anymore.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-2xl shrink-0">🔗</span>
                    <div>
                      <p className="font-semibold text-foreground">Shadow Network Discovery</p>
                      <p className="text-sm text-muted-foreground">We detect coordinated wallet clusters that mint together in suspiciously tight windows. If "independent" wallets are secretly working together, we'll find the connection.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <span className="text-2xl shrink-0">⚡</span>
                    <div>
                      <p className="font-semibold text-foreground">Pre-Mint Early Warnings</p>
                      <p className="text-sm text-muted-foreground">Get alerts when known developers receive funding — a signal they're about to launch — giving you a head start before the mint even happens.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Channel vs Bot clarification */}
          <div className="mt-8 max-w-xl mx-auto space-y-3">
            <div className="rounded-lg border border-muted/30 bg-primary/5 p-4 text-center space-y-1">
              <p className="text-sm font-bold text-foreground">The Bot is NOT the Channel and the Channel is NOT the Bot!!</p>
              <div className="flex flex-col sm:flex-row justify-center gap-3 text-xs text-muted-foreground">
                <p><span className="font-semibold text-blue-400">Channel</span> = Public Feed of the Hottest Tokens on-chain</p>
                <p><span className="font-semibold text-primary">Intel Bot</span> = Your Private Query Bot for $TICKER Lookups</p>
              </div>
            </div>

            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 backdrop-blur-sm p-4 flex items-center gap-4">
              <div className="shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">📢 Join the Holders Intel Channel Also!!</p>
                <p className="text-xs font-bold text-green-400">FREE! Hop in!</p>
                <p className="text-xs text-muted-foreground">Live alerts, alpha drops, and token intel — straight to your Telegram.</p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0 border-blue-400/30 text-blue-400 hover:bg-blue-500/10 gap-1" asChild>
                <a href="https://t.me/HoldersIntel" target="_blank" rel="noopener noreferrer">
                  Join <ExternalLink className="w-3 h-3" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonial Carousel */}
      <section className="max-w-4xl mx-auto px-4 py-6">
        <TestimonialCarousel />
      </section>

      {/* Three Pillars */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-3 text-primary border-primary/30">
            The Platform
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Three Pillars of Token Intelligence
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {PRODUCT_PILLARS.map((pillar) => (
            <Card key={pillar.title} className="bg-card border-border relative overflow-hidden group hover:border-primary/30 transition-colors">
              {pillar.isNew && (
                <div className="absolute top-3 right-3">
                  <Badge className="bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider">
                    Coming to Public
                  </Badge>
                </div>
              )}
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  {pillar.icon}
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{pillar.title}</h3>
                    <p className="text-xs text-muted-foreground">{pillar.subtitle}</p>
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {pillar.description}
                </p>

                <ul className="space-y-2">
                  {pillar.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-foreground/80">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="pt-2 border-t border-border">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Available: {pillar.tier}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* View Pricing CTA */}
      <section className="max-w-6xl mx-auto px-4 py-10 text-center">
        <Button 
          size="lg" 
          variant="outline"
          onClick={() => navigate("/subscriptions")}
          className="gap-2"
        >
          View Pricing
          <ArrowRight className="w-4 h-4" />
        </Button>
      </section>

      {/* Unique Signals */}
      <section className="border-t border-border bg-card/50">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-3 text-primary border-primary/30">
              What Makes Us Different
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-foreground">
              Signals You Can't Get Anywhere Else
            </h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              We don't just count holders. We trace networks, detect recycled identities, 
              and cross-reference every wallet against our growing bad-actor database.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {UNIQUE_SIGNALS.map((signal) => (
              <Card key={signal.title} className="bg-background border-border hover:border-primary/20 transition-colors">
                <CardContent className="p-5 space-y-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary animate-[pulse_3s_ease-in-out_infinite]">
                    {signal.icon}
                  </div>
                  <h3 className="font-semibold text-foreground">{signal.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{signal.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Tier Comparison */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <Badge variant="outline" className="mb-3 text-primary border-primary/30">
            Access Levels
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Choose Your Intel Level
          </h2>
          <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
            From free basics to full-spectrum intelligence. 
            Every tier works across web, Telegram, and the Bubble Map.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {TIERS.map((tier) => (
            <Card 
              key={tier.name} 
              className={`relative bg-card ${tier.color} ${tier.highlight ? 'ring-1 ring-primary shadow-glow' : ''} transition-all hover:border-primary/40`}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground text-[10px] font-bold uppercase">
                    Most Popular
                  </Badge>
                </div>
              )}
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="text-primary">{tier.icon}</div>
                  <h3 className="font-bold text-foreground">{tier.name}</h3>
                </div>
                
                <div>
                  <span className="text-2xl font-black text-foreground">{tier.price}</span>
                </div>
                
                <p className="text-xs text-muted-foreground">{tier.description}</p>

                <ul className="space-y-2 pt-2">
                  {tier.features.map((f) => (
                    <li key={f.name} className="flex items-center gap-2 text-sm">
                      <FeatureCheck included={f.included} />
                      <span className={f.included ? 'text-foreground/90' : 'text-muted-foreground/50'}>
                        {f.name}
                      </span>
                    </li>
                    ))}
                  </ul>
                  
                  <div className="pt-2">
                    {tier.cta.action === "checkout" ? (
                      <Button 
                        variant="default" 
                        className="w-full gap-2"
                        disabled={checkoutLoading}
                        onClick={handleProCheckout}
                      >
                        {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : tier.cta.label}
                        {!checkoutLoading && <ArrowRight className="w-4 h-4" />}
                      </Button>
                    ) : tier.cta.action === "external" ? (
                      <a href={tier.cta.to} target="_blank" rel="noopener noreferrer" className="block">
                        <Button variant={tier.highlight ? "default" : "outline"} className="w-full gap-2">
                          {tier.cta.label} <ArrowRight className="w-4 h-4" />
                        </Button>
                      </a>
                    ) : (
                      <Button 
                        variant={tier.highlight ? "default" : "outline"} 
                        className="w-full gap-2"
                        onClick={() => navigate(tier.cta.to)}
                      >
                        {tier.cta.label} <ArrowRight className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
          ))}
        </div>
      </section>

      {/* Telegram Bot Section */}
      <section className="border-t border-border bg-card/30">
        <div className="max-w-6xl mx-auto px-4 py-20">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <Badge variant="outline" className="text-primary border-primary/30">
                Telegram Integration
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground">
                Intel Everywhere You Trade
              </h2>
              <p className="text-muted-foreground leading-relaxed">
                Drop a contract address into @holdersintel_bot and get instant analysis. 
                Works in private DMs with full reports, or in group chats with abbreviated 
                intel designed to inform without spamming.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MessageSquare className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground text-sm">Group Chat Mode</p>
                    <p className="text-xs text-muted-foreground">Abbreviated summaries, emoji risk signals, one-liners. No spam.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground text-sm">DM Mode</p>
                    <p className="text-xs text-muted-foreground">Full narrative reports, AI analysis, wallet tracing, deep data.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-foreground text-sm">Group+ Access</p>
                    <p className="text-xs text-muted-foreground">Register via DM to unlock breadcrumb features in group chats.</p>
                  </div>
                </div>
              </div>
              <a href="https://t.me/holdersintel_bot" target="_blank" rel="noopener noreferrer">
                <Button className="gap-2 mt-2">
                  <Bot className="w-4 h-4" />
                  Open @holdersintel_bot
                  <ExternalLink className="w-3 h-3" />
                </Button>
              </a>
            </div>

            {/* Fake terminal card */}
            <div className="bg-background border border-border rounded-xl overflow-hidden shadow-glow-soft">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                <div className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30" />
                <span className="text-[10px] text-muted-foreground ml-2 font-mono">@holdersintel_bot</span>
              </div>
              <div className="p-4 font-mono text-xs space-y-3 text-foreground/80">
                <div>
                  <span className="text-primary">/risk</span>{" "}
                  <span className="text-muted-foreground">7xKXtg...pump</span>
                </div>
                <div className="border-l-2 border-primary/30 pl-3 space-y-1">
                  <p>📊 <span className="text-foreground">$EXAMPLE</span> (Example Token)</p>
                  <p>💰 Market Cap: $1.2M</p>
                  <p>🏆 Stability: <span className="text-primary">72/100</span></p>
                  <p>🎯 Risk: <span className="text-primary font-bold">MODERATE STRENGTH</span></p>
                  <p className="text-muted-foreground">━━━━━━━━━━━━━━━━</p>
                  <p>💬 Token shows healthy distribution with 68% in small wallets. Dev wallet inactive 14d. One flagged holder from reputation DB.</p>
                </div>
                <div className="text-muted-foreground/50 text-[10px]">
                  ⚡ Powered by Holders Intel · Pro Tier
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bubble Map Teaser */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-10">
          <Badge variant="outline" className="mb-3 text-primary border-primary/30">
            <Network className="w-3 h-3 mr-1" />
            Bubble Map Technology
          </Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            See the Network. Expose the Patterns.
          </h2>
          <p className="text-muted-foreground mt-3 max-w-2xl mx-auto">
            An interactive force-directed graph that maps every connection — from token to developer, 
            from developer to funder, from funder to KYC exchange root.
          </p>
        </div>

        <Card className="bg-card border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
              <div className="p-6 space-y-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-bold text-foreground">On-Chain Branch</h3>
                <p className="text-sm text-muted-foreground">
                  Token → Dev Wallet → Related Wallets → KYC Root. 
                  Recursive depth-3 scanning discovers the master wallets.
                </p>
              </div>
              <div className="p-6 space-y-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-bold text-foreground">Social Branch</h3>
                <p className="text-sm text-muted-foreground">
                  Token → X Community → Admin & Mod handles. 
                  Identity verified through immutable numeric IDs.
                </p>
              </div>
              <div className="p-6 space-y-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-bold text-foreground">Web Branch</h3>
                <p className="text-sm text-muted-foreground">
                  Token → Website metadata. Surface-level connections 
                  that complete the picture.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-8">
          <Button 
            variant="outline" 
            size="lg"
            onClick={() => navigate("/bubblepromo")}
            className="gap-2"
          >
            <Network className="w-4 h-4" />
            Try the Bubble Map
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="max-w-4xl mx-auto px-4 py-20 text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            Stop Trading Blind
          </h2>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Every token has a story hidden in its holder data, wallet networks, and social connections. 
            We make that story readable.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => navigate("/subscriptions#plans")} className="gap-2 shadow-glow">
              <Rocket className="w-4 h-4" />
              Get Started Free
            </Button>
            <XSuspendedPopover>
              <Button size="lg" variant="outline" className="gap-2">
                <SocialIcon platform="twitter" className="w-4 h-4" />
                Follow @holdersintel
              </Button>
            </XSuspendedPopover>
          </div>
        </div>
      </section>
    </SiteLayout>
  );
}
