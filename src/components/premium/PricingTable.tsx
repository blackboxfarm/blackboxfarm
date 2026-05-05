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
import { CheckoutTransitionModal } from './CheckoutTransitionModal';
import { TierCards } from './TierCards';

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
  { label: 'Ad-Free Experience', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: 'Priority Support', free: false, auth: false, xSub: false, pro: false, dev: false, enterprise: true, comingSoon: true },
  // Bubble Map features
  { label: '🫧 Bubble Map Lookups/Day', free: '2', auth: '2', xSub: '10', pro: '∞', dev: '∞', enterprise: '∞' },
  { label: '🫧 Graph Visualization', free: true, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: '🫧 Auto-Spider', free: false, auth: false, xSub: true, pro: true, dev: true, enterprise: true },
  { label: '🫧 Find KYC Root', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: '🫧 Find All Tokens', free: false, auth: false, xSub: '3/day', pro: true, dev: true, enterprise: true },
  { label: '🫧 Deep Spider', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: '🫧 Node Cap', free: '20', auth: '40', xSub: '80', pro: '∞', dev: '∞', enterprise: '∞' },
  { label: '🫧 Export Graph Data', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  // Telegram Bot features
  { label: '🤖 TG Bot: /holders', free: false, auth: 'Lite', xSub: 'Full', pro: 'Full+', dev: 'Full+', enterprise: 'Full+' },
  { label: '🤖 TG Bot: /risk', free: false, auth: '🟢/🔴', xSub: '✓ Full', pro: '✓ Full', dev: '✓ Full', enterprise: '✓ Full' },
  { label: '🤖 TG Bot: /momentum', free: false, auth: false, xSub: true, pro: true, dev: true, enterprise: true },
  { label: '🤖 TG Bot: /oracle', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: '🤖 TG Bot: /wallet', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: '🤖 TG Bot: /ticket', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
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
  const [xSubBillingCycle, setXSubBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingCheckoutTier, setPendingCheckoutTier] = useState<'pro' | 'dev' | 'enterprise' | null>(null);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [transitionIsNewAccount, setTransitionIsNewAccount] = useState(true);

  // After auth completes, continue to checkout
  const continueCheckoutAfterAuth = useCallback(async (tierKey: 'pro' | 'dev' | 'enterprise') => {
    setLoadingTier(tierKey);
    try {
      const isXSub = tierInfo.isXSubscriber;
      const stripeConfig = STRIPE_TIERS[tierKey];
      let priceId: string;

      if (isXSub && tierKey === 'pro' && xSubBillingCycle === 'yearly' && 'x_sub_yearly_price_id' in stripeConfig) {
        priceId = stripeConfig.x_sub_yearly_price_id;
      } else if (isXSub) {
        priceId = stripeConfig.x_sub_price_id;
      } else {
        priceId = stripeConfig.price_id;
      }

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { priceId },
      });

      if (error) throw error;
      if (data?.url) {
        // Same-tab redirect — popup blockers (esp. mobile Safari) silently kill window.open
        window.location.assign(data.url);
      }
    } catch (err) {
      console.error('Checkout error:', err);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setLoadingTier(null);
    }
  }, [tierInfo.isXSubscriber, xSubBillingCycle]);

  const handleCheckout = async (tierKey: 'pro' | 'dev' | 'enterprise') => {
    if (!user) {
      setPendingCheckoutTier(tierKey);
      setShowAuthModal(true);
      return;
    }
    await continueCheckoutAfterAuth(tierKey);
  };

  // Smart default tab: returning visitors (have a stored email) default to sign in;
  // truly anon users default to sign up.
  const authModalDefaultTab: 'signin' | 'signup' =
    typeof window !== 'undefined' && window.localStorage.getItem('bbx_last_email')
      ? 'signin'
      : 'signup';

  const handleAuthModalClose = () => {
    setShowAuthModal(false);
    if (pendingCheckoutTier) {
      const tier = pendingCheckoutTier;
      setPendingCheckoutTier(null);
      // Show transition modal instead of immediately opening Stripe
      setTimeout(async () => {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          setTransitionIsNewAccount(true);
          setShowTransitionModal(true);
          // Store tier for when transition completes
          setPendingCheckoutTier(tier);
        }
      }, 300);
    }
  };

  const handleTransitionComplete = useCallback(async () => {
    setShowTransitionModal(false);
    if (pendingCheckoutTier) {
      const tier = pendingCheckoutTier;
      setPendingCheckoutTier(null);
      await continueCheckoutAfterAuth(tier);
    }
  }, [pendingCheckoutTier, continueCheckoutAfterAuth]);

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

  // Discount calculation for X Sub yearly: $4/mo × 12 = $48/yr, yearly = $38.99, save 19%
  const xSubMonthlyAnnualized = 4.0 * 12; // $48
  const xSubYearlyPrice = 38.99;
  const xSubYearlySavingsPct = Math.round(((xSubMonthlyAnnualized - xSubYearlyPrice) / xSubMonthlyAnnualized) * 100);

  const tiers = [
    {
      key: 'free',
      name: 'Free',
      price: '$0',
      xPrice: null,
      xYearlyPrice: null,
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
      xYearlyPrice: null,
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
      xYearlyPrice: null,
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
      xPrice: '$4.00',
      xYearlyPrice: '$38.99',
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
      xYearlyPrice: null,
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
      xYearlyPrice: null,
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
      <TierCards />

      {/* X Subscriber Verification */}
      {user && <XSubscriberVerification />}

      {/* Inline Auth Modal for smooth checkout flow */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={handleAuthModalClose}
        defaultTab={authModalDefaultTab}
      />

      {/* Transition modal between auth and Stripe */}
      <CheckoutTransitionModal
        isOpen={showTransitionModal}
        onComplete={handleTransitionComplete}
        isNewAccount={transitionIsNewAccount}
      />
    </div>
  );
}
