import { Check, X, Crown, Sparkles, Zap, Users, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useUserTier } from '@/hooks/useUserTier';
import { useNavigate } from 'react-router-dom';

interface PricingFeature {
  label: string;
  free: boolean | string;
  auth: boolean | string;
  xSub: boolean | string;
  pro: boolean | string;
  dev: boolean | string;
  enterprise: boolean | string;
}

const features: PricingFeature[] = [
  { label: 'Basic Holder Report', free: true, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'Health Grade & Score', free: true, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'AI Quick Summary', free: true, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'Reports per Day', free: '3', auth: '10', xSub: '20', pro: '50', dev: '200', enterprise: '500' },
  { label: 'Full AI Panel', free: false, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'Whale Warnings', free: false, auth: true, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'AI Overview (detailed)', free: false, auth: false, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'Wallet Clustering', free: false, auth: false, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'First Buyer Intel', free: false, auth: false, xSub: true, pro: true, dev: true, enterprise: true },
  { label: 'Key Drivers Analysis', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: 'Reasoning Trace', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: 'Comparison Charts', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: 'CSV Export', free: false, auth: false, xSub: false, pro: true, dev: true, enterprise: true },
  { label: 'API Access', free: false, auth: false, xSub: false, pro: false, dev: true, enterprise: true },
  { label: 'Webhooks', free: false, auth: false, xSub: false, pro: false, dev: true, enterprise: true },
  { label: 'Team Seats', free: '1', auth: '1', xSub: '1', pro: '1', dev: '1', enterprise: '4' },
  { label: 'Priority Support', free: false, auth: false, xSub: false, pro: false, dev: false, enterprise: true },
];

function FeatureValue({ value }: { value: boolean | string }) {
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
    },
    {
      key: 'dev',
      name: 'Developer',
      price: '$29.99',
      xPrice: '$22.99',
      description: 'API access & automation',
      icon: <Zap className="h-4 w-4" />,
      highlight: false,
      cta: 'Coming Soon',
      badge: null,
    },
    {
      key: 'enterprise',
      name: 'Enterprise',
      price: '$49.99',
      xPrice: '$39.99',
      description: 'Team & white-label',
      icon: <Users className="h-4 w-4" />,
      highlight: false,
      cta: 'Coming Soon',
      badge: null,
    },
  ];

  return (
    <div className="space-y-8">
      {/* Tier Cards - Mobile-friendly */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiers.map((tier) => {
          const isCurrent = tierInfo.tierKey === tier.key;
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
                  disabled={isCurrent || tier.cta === 'Coming Soon'}
                  onClick={() => {
                    if (tier.key === 'x_subscriber') {
                      window.open('https://x.com/holdersintel', '_blank');
                    } else if (!user) {
                      navigate('/auth');
                    }
                  }}
                >
                  {isCurrent ? '✓ Current Plan' : tier.cta}
                  {!isCurrent && tier.cta !== 'Coming Soon' && <ArrowRight className="h-3.5 w-3.5 ml-1" />}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Feature Comparison Table - Desktop */}
      <div className="hidden lg:block overflow-x-auto">
        <table className="w-full text-sm">
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
                <td className="py-2.5 px-4 text-foreground/80">{feature.label}</td>
                <td className="text-center py-2.5"><FeatureValue value={feature.free} /></td>
                <td className="text-center py-2.5"><FeatureValue value={feature.auth} /></td>
                <td className="text-center py-2.5"><FeatureValue value={feature.xSub} /></td>
                <td className="text-center py-2.5 bg-primary/5"><FeatureValue value={feature.pro} /></td>
                <td className="text-center py-2.5"><FeatureValue value={feature.dev} /></td>
                <td className="text-center py-2.5"><FeatureValue value={feature.enterprise} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
