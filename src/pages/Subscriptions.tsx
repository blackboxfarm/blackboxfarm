import { useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { PricingTable } from '@/components/premium/PricingTable';
import { XSubscriberVerification } from '@/components/premium/XSubscriberVerification';
import { TelegramLinkCode } from '@/components/settings/TelegramLinkCode';
import { SocialIcon } from '@/components/token/SocialIcon';
import { useUserTier } from '@/hooks/useUserTier';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  ExternalLink,
  Brain,
  BarChart3,
  Wallet,
  Activity,
  Shield,
  Zap,
  ChevronRight,
  MessageCircle,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const OG_IMAGE_URL = 'https://blackboxfarm.lovable.app/images/holders-intel-og.png';

export default function Subscriptions() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { checkSubscription, tierInfo } = useUserTier();
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success('Subscription activated! Welcome aboard 🎉');
      checkSubscription();
      setSearchParams({}, { replace: true });
    } else if (searchParams.get('canceled') === 'true') {
      toast.info('Checkout canceled. No charges were made.');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams]);

  const features = [
    { icon: Brain, title: 'AI Token Analysis', desc: 'Deep AI interpretation of holder patterns, wallet clustering, and lifecycle staging' },
    { icon: BarChart3, title: 'Advanced Charts', desc: 'Holder distribution, flow analysis, and comparison charts across tokens' },
    { icon: Wallet, title: 'Whale Tracking', desc: 'Real-time whale wallet monitoring with automated Telegram & email alerts' },
    { icon: Activity, title: 'Lifecycle Intel', desc: 'Know exactly where a token sits — Genesis, Expansion, Distribution, or Dormant' },
    { icon: Shield, title: 'Risk Scoring', desc: 'Bundle detection, dev wallet analysis, and holder quality grading' },
    { icon: Zap, title: 'Auto-Buy Bot', desc: 'Pro subscribers get wallet management and automated trading via Telegram' },
  ];

  // Set OG meta tags
  useEffect(() => {
    document.title = 'Holders Intel AI — Subscriptions';
    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) || document.querySelector(`meta[name="${property}"]`);
      if (!el) {
        el = document.createElement('meta');
        if (property.startsWith('og:')) {
          el.setAttribute('property', property);
        } else {
          el.setAttribute('name', property);
        }
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setMeta('description', 'Let AI Handle the Granular Noise — You Handle the Market. AI-powered token holder analysis.');
    setMeta('og:title', 'Holders Intel AI — Subscriptions');
    setMeta('og:description', 'Let AI Handle the Granular Noise — You Handle the Market.');
    setMeta('og:image', OG_IMAGE_URL);
    setMeta('og:type', 'website');
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', 'Holders Intel AI — Subscriptions');
    setMeta('twitter:description', 'Let AI Handle the Granular Noise — You Handle the Market.');
    setMeta('twitter:image', OG_IMAGE_URL);
  }, []);

  return (
      <div className="min-h-screen bg-background">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/40">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-yellow-500/5" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_60%)]" />
          <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-24">
            <div className="text-center space-y-5">
              <Badge variant="outline" className="border-primary/30 text-primary text-xs tracking-wider uppercase px-3 py-1">
                AI-Powered Token Intelligence
              </Badge>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight">
                <span className="bg-gradient-to-r from-cyan-400 via-primary to-cyan-400 bg-clip-text text-transparent">
                  Holders Intel
                </span>
                <span className="text-foreground"> AI</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Let AI Handle the Granular Noise — <span className="text-foreground font-semibold">You Handle the Market</span>
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  size="lg"
                  className="gap-2"
                  onClick={() => document.getElementById('plans')?.scrollIntoView({ behavior: 'smooth' })}
                >
                  View Plans <ChevronRight className="w-4 h-4" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => navigate('/holders')}
                >
                  Try Free Analysis
                </Button>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-2">
                <SocialIcon platform="twitter" className="w-4 h-4" />
                <a
                  href="https://x.com/holdersintel"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  @holdersintel subscribers save on every paid plan
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-2xl font-bold text-center mb-10">What You Get</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map((f, i) => (
              <Card key={i} className="bg-card/50 border-border/50 hover:border-primary/30 transition-colors">
                <CardContent className="p-5 flex gap-4">
                  <div className="shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{f.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{f.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Plans */}
        <section id="plans" className="mx-auto max-w-6xl px-4 pb-12 space-y-8">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Choose Your Plan</h2>
            <p className="text-sm text-muted-foreground">Monthly subscriptions. Cancel anytime.</p>
          </div>

          <PricingTable />

          {/* X Verification + Telegram Link side by side */}
          {user && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
              <XSubscriberVerification />
              <TelegramLinkCode />
            </div>
          )}
        </section>

        {/* Telegram Bot Promo */}
        <section className="mx-auto max-w-4xl px-4 pb-12">
          <Card className="border-blue-500/20 bg-gradient-to-r from-blue-500/5 via-transparent to-cyan-500/5">
            <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-6">
              <div className="shrink-0 w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                <MessageCircle className="w-8 h-8 text-blue-400" />
              </div>
              <div className="flex-1 text-center md:text-left space-y-2">
                <div className="flex items-center justify-center md:justify-start gap-2">
                  <h3 className="text-lg font-bold">Telegram Bot</h3>
                  <Badge variant="outline" className="text-xs border-blue-400/30 text-blue-400">Coming Soon</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Get holder analysis, risk assessments, and momentum scores right in your Telegram DMs. 
                  Your subscription tier carries over automatically.
                </p>
              </div>
              <Button variant="outline" className="shrink-0 border-blue-400/30 text-blue-400 hover:bg-blue-500/10" asChild>
                <Link to="/tgbot">
                  Learn More <ArrowRight className="w-4 h-4 ml-1" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Billing notice */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70 pb-6">
          <span>
            Billing powered by Stripe under{' '}
            <a
              href="https://systemreset.ca"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-muted-foreground"
            >
              System Reset
            </a>
            , our parent company.
          </span>
        </div>

        {/* FAQ */}
        <section className="mx-auto max-w-2xl px-4 pb-16 space-y-4 text-sm">
          <h2 className="text-xl font-semibold text-center">FAQ</h2>
          <div className="space-y-3">
            <div>
              <p className="font-medium">How does the X Subscriber discount work?</p>
              <p className="text-muted-foreground">
                Subscribe to @holdersintel on X, then verify with a community code in Settings.
                Verified subscribers get reduced pricing on all paid tiers.
              </p>
            </div>
            <div>
              <p className="font-medium">Can I cancel anytime?</p>
              <p className="text-muted-foreground">Yes. All subscriptions are monthly with no long-term commitment.</p>
            </div>
            <div>
              <p className="font-medium">How does the Telegram bot work?</p>
              <p className="text-muted-foreground">
                Generate a link code in Settings, send it to our bot, and your bot access automatically matches your subscription tier.
                Pro subscribers unlock wallet management and auto-buy features.
              </p>
            </div>
            <div>
              <p className="font-medium">What's included free?</p>
              <p className="text-muted-foreground">
                Basic holder analysis, health grade, and an AI quick summary — no account needed.
                Sign up free for the full AI panel and whale warnings.
              </p>
            </div>
          </div>
        </section>
      </div>
  );
}
