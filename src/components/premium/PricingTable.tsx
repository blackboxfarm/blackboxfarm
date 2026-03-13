import { Check, X, Crown, Sparkles, Zap, Users, ArrowRight, Loader2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useUserTier } from '@/hooks/useUserTier';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { STRIPE_TIERS } from '@/config/stripeTiers';
import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { XSubscriberVerification } from './XSubscriberVerification';
import { AuthModal } from '@/components/auth/AuthModal';

interface PricingFeature {
  label: string;
  free: boolean | string;
  auth: boolean | string;
  xSub: boolean | string;
  pro: boolean | string;
  dev: boolean | string;
  enterprise: boolean | string;
  comingSoon?: boolean;
}

const features: PricingFeature[] = [
  { label: 'Basic Holder Report', free: true, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'Health Grade & Score', free: true, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'AI Quick Summary', free: true, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'Reports per Day', free: '3', auth: '10', xSub: '20', pro: '50', dev: '200', enterprise: '500' },
  { label: 'Full AI Panel', free: false, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'Whale Warnings', free: false, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'AI Overview (detailed)', free: false, auth: false, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'First Buyer Intel', free: false, auth: false, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'Key Drivers Analysis', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: 'Reasoning Trace', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: 'CSV Export', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: 'Wallet Clustering', free: false, auth: false, xSub: true, pro: true, dev: true, enterprise: true, comingSoon: true },
  { label: 'Comparison Charts', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true, comingSoon: true },
  { label: 'API Access', free: false, auth: false, xSub: false, pro: false, dev: true, enterprise: true, comingSoon: true },
  { label: 'Webhooks', free: false, auth: false, xSub: false, pro: false, dev: true, enterprise: true, comingSoon: true },
  { label: 'Team Seats', free: '1', auth: '1', xSub: '1', pro: '1', dev: '1', enterprise: '4', comingSoon: true },
  { label: 'Priority Support', free: false, auth: false, xSub: false, pro: false, dev: false, enterprise: true, comingSoon: true },
  // Telegram Bot features
  { label: '🤖 TG Bot: /holders', free: false, auth: 'Lite', xSub: 'Full', pro: 'Full+', dev: 'Full+', enterprise: 'Full+' },
  { label: '🤖 TG Bot: /risk', free: false, auth: '🟢/🔴', xSub: '✓ Full', pro: '✓ Full', dev: '✓ Full', enterprise: '✓ Full' },
  { label: '🤖 TG Bot: /momentum', free: false, auth: false, xSub: true, pro: true, dev: true, enterprise: true },
  { label: '🤖 TG Bot: /oracle', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: '🤖 TG Bot: /wallet', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: '🤖 TG Bot: /alerts', free: false, auth: false, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'Bot Lookups / Hour', free: '0', auth: '3', xSub: '10', pro: '25', dev: '50', enterprise: '50' },
];

function FeatureValue({ value, comingSoon }: { value: boolean | string; comingSoon?: boolean }) {
  if (comingSoon && (value === true || (typeof value === 'string' && value !== '1'))) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        Soon
      </span>
    );
  }
  if (typeof value === 'string') {
    return <span className="text-sm font-medium text-foreground">{value}</span>;
  }
  return value ? (
    <Check className="h-4 w-4 text-green-400 mx-auto" />
  ) : (
    <X className="h-4 w-4 text-muted-foreground/30 mx-auto" />
  );
}

export function PricingTable() {
  const { user } = useAuth();
  const { tierInfo } = useUserTier();
  const navigate = useNavigate();
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingCheckoutTier, setPendingCheckoutTier] = useState<'pro' | 'dev' | 'enterprise' | null>(null);

  // After auth completes, continue to checkout
  const continueCheckoutAfterAuth = useCallback(async (tierKey: 'pro' | 'dev' | 'enterprise') => {
    setLoadingTier(tierKey);
    try {
      const isXSub = tierInfo.isXSubscriber;
      const stripeConfig = STRIPE_TIERS[tierKey];
      const priceId = isXSub ? stripeConfig.x_sub_price_id : stripeConfig.price_id;

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
      setLoadingTier(null);
    }
  }, [tierInfo.isXSubscriber]);

  const handleCheckout = async (tierKey: 'pro' | 'dev' | 'enterprise') => {
    if (!user) {
      // Store which tier they wanted, then show auth modal
      setPendingCheckoutTier(tierKey);
      setShowAuthModal(true);
      return;
    }
    await continueCheckoutAfterAuth(tierKey);
  };

  const handleAuthModalClose = () => {
    setShowAuthModal(false);
    // If user just authenticated and had a pending checkout, continue it
    if (pendingCheckoutTier) {
      // Small delay to let auth state propagate
      const tier = pendingCheckoutTier;
      setPendingCheckoutTier(null);
      setTimeout(async () => {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          await continueCheckoutAfterAuth(tier);
        }
      }, 500);
    }
  };

  const handleManageSubscription = async () => {
    setLoadingTier('manage');
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err) {
      console.error('Portal error:', err);
      toast.error('Failed to open subscription management.');
    } finally {
      setLoadingTier(null);
    }
  };

  const tiers = [
    {
      key: 'free',
      name: 'Free',
      price: '$0',
      xPrice: null,
      description: 'Basic token analysis',
      icon: null,
      highlight: false,
      cta: user ? 'Current' : 'Get Started',
      badge: null,
      stripeKey: null as 'pro' | 'dev' | 'enterprise' | null,
    },
    {
      key: 'auth',
      name: 'Free Account',
      price: '$0',
      xPrice: null,
      description: 'AI analysis & alerts',
      icon: null,
      highlight: false,
      cta: user ? (tierInfo.tierKey === 'auth' ? 'Current' : 'Included') : 'Sign Up Free',
      badge: null,
      stripeKey: null as 'pro' | 'dev' | 'enterprise' | null,
    },
    {
      key: 'x_subscriber',
      name: 'X Subscriber',
      price: 'Included',
      xPrice: null,
      description: 'Via @holdersintel X subscription',
      icon: <Sparkles className="h-4 w-4" />,
      highlight: false,
      cta: 'Subscribe on X',
      badge: null,
      stripeKey: null as 'pro' | 'dev' | 'enterprise' | null,
    },
    {
      key: 'pro',
      name: 'Pro',
      price: '$9.99',
      xPrice: '$7.99',
      description: 'Complete analysis suite',
      icon: <Crown className="h-4 w-4" />,
      highlight: true,
      cta: 'Upgrade to Pro',
      badge: 'Most Popular',
      stripeKey: 'pro' as const,
    },
    {
      key: 'dev',
      name: 'Developer',
      price: '$29.99',
      xPrice: '$22.99',
      description: 'API access & automation',
      icon: <Zap className="h-4 w-4" />,
      highlight: false,
      cta: 'Upgrade to Developer',
      badge: null,
      stripeKey: 'dev' as const,
    },
    {
      key: 'enterprise',
      name: 'Enterprise',
      price: '$49.99',
      xPrice: '$39.99',
      description: 'Team & white-label',
      icon: <Users className="h-4 w-4" />,
      highlight: false,
      cta: 'Upgrade to Enterprise',
      badge: null,
      stripeKey: 'enterprise' as const,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Feature Comparison Table */}
      <div className="overflow-x-auto -mx-4 px-4">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-medium text-muted-foreground">Feature</th>
              {tiers.map((t) => (
                <th key={t.key} className={`text-center py-3 px-3 font-medium ${t.highlight ? 'text-primary' : ''}`}>
                  {t.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((feature, i) => (
              <tr key={i} className="border-b border-border/30">
                <td className="py-2.5 px-4 text-foreground/80">
                  {feature.label}
                  {feature.comingSoon && (
                    <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 border-muted-foreground/30 text-muted-foreground">
                      <Clock className="h-2.5 w-2.5 mr-0.5" />
                      Soon
                    </Badge>
                  )}
                </td>
                <td className="text-center py-2.5"><FeatureValue value={feature.free} comingSoon={feature.comingSoon} /></td>
                <td className="text-center py-2.5"><FeatureValue value={feature.auth} comingSoon={feature.comingSoon} /></td>
                <td className="text-center py-2.5"><FeatureValue value={feature.xSub} comingSoon={feature.comingSoon} /></td>
                <td className="text-center py-2.5 bg-primary/5"><FeatureValue value={feature.pro} comingSoon={feature.comingSoon} /></td>
                <td className="text-center py-2.5"><FeatureValue value={feature.dev} comingSoon={feature.comingSoon} /></td>
                <td className="text-center py-2.5"><FeatureValue value={feature.enterprise} comingSoon={feature.comingSoon} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Manage existing subscription */}
      {tierInfo.tierKey !== 'free' && tierInfo.tierKey !== 'auth' && tierInfo.tierKey !== 'x_subscriber' && (
        <div className="text-center">
          <Button variant="outline" onClick={handleManageSubscription} disabled={loadingTier === 'manage'}>
            {loadingTier === 'manage' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Manage Subscription
          </Button>
          {tierInfo.subscriptionEnd && (
            <p className="text-xs text-muted-foreground mt-1">
              Renews {new Date(tierInfo.subscriptionEnd).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Tier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const isCurrent = tierInfo.tierKey === tier.key;
          const isLoading = loadingTier === tier.key;
          return (
            <Card
              key={tier.key}
              className={`relative ${tier.highlight ? 'border-primary shadow-lg shadow-primary/10' : 'border-border/50'} ${isCurrent ? 'ring-2 ring-primary' : ''}`}
            >
              {tier.badge && (
                <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs">
                  {tier.badge}
                </Badge>
              )}
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  {tier.icon}
                  <CardTitle className="text-lg">{tier.name}</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">{tier.description}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-3xl font-bold">{tier.price}</span>
                  {tier.price !== '$0' && tier.price !== 'Included' && (
                    <span className="text-sm text-muted-foreground">/mo</span>
                  )}
                  {tier.xPrice && (
                    <p className="text-xs text-blue-400 mt-0.5">
                      {tier.xPrice}/mo for X Subscribers
                    </p>
                  )}
                </div>

                <Button
                  className="w-full"
                  variant={tier.highlight ? 'default' : 'outline'}
                  disabled={isCurrent || isLoading}
                  onClick={() => {
                    if (tier.key === 'x_subscriber') {
                      window.open('https://x.com/holdersintel', '_blank');
                    } else if (tier.stripeKey) {
                      handleCheckout(tier.stripeKey);
                    } else if (!user) {
                      setShowAuthModal(true);
                    }
                  }}
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : null}
                  {isCurrent ? '✓ Current Plan' : tier.cta}
                  {!isCurrent && !isLoading && <ArrowRight className="h-3.5 w-3.5 ml-1" />}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* X Subscriber Verification */}
      {user && <XSubscriberVerification />}

      {/* Inline Auth Modal for smooth checkout flow */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={handleAuthModalClose}
        defaultTab="signup"
      />
    </div>
  );
}
