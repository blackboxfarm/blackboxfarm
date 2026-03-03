import { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles, Crown, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WebTierKey } from '@/hooks/useUserTier';

interface TierGateProps {
  requiredTier: WebTierKey;
  currentTierMeetsRequirement: boolean;
  children: ReactNode;
  featureLabel?: string;
  featureDescription?: string;
  showTeaser?: boolean;
}

const tierIcons: Record<WebTierKey, ReactNode> = {
  free: null,
  auth: <Lock className="h-5 w-5" />,
  x_subscriber: <Sparkles className="h-5 w-5 text-blue-400" />,
  pro: <Crown className="h-5 w-5 text-yellow-400" />,
  dev: <Zap className="h-5 w-5 text-green-400" />,
  enterprise: <Zap className="h-5 w-5 text-purple-400" />,
};

const tierLabels: Record<WebTierKey, string> = {
  free: 'Free',
  auth: 'Free Account',
  x_subscriber: 'X Subscriber',
  pro: 'Pro ($9.99/mo)',
  dev: 'Developer ($29.99/mo)',
  enterprise: 'Enterprise ($49.99/mo)',
};

export function TierGate({
  requiredTier,
  currentTierMeetsRequirement,
  children,
  featureLabel = 'Premium Feature',
  featureDescription = 'Upgrade your plan to unlock this feature.',
  showTeaser = true,
}: TierGateProps) {
  const navigate = useNavigate();

  if (currentTierMeetsRequirement) {
    return <>{children}</>;
  }

  return (
    <Card className="relative overflow-hidden border-primary/20">
      {/* Blurred teaser */}
      {showTeaser && (
        <div className="filter blur-md opacity-20 pointer-events-none select-none">
          {children}
        </div>
      )}

      {/* Upgrade overlay */}
      <div className={`${showTeaser ? 'absolute inset-0' : ''} bg-gradient-to-b from-background/80 via-background/90 to-background z-10 flex flex-col items-center justify-center p-4 md:p-6 text-center`}>
        <div className="bg-primary/10 rounded-full p-3 mb-3 border border-primary/20">
          {tierIcons[requiredTier] || <Lock className="h-5 w-5 text-primary" />}
        </div>

        <h3 className="text-lg font-bold mb-1">{featureLabel}</h3>
        <p className="text-sm text-muted-foreground mb-3 max-w-sm">
          {featureDescription}
        </p>

        <div className="flex flex-col gap-2 items-center">
          <Button
            onClick={() => navigate('/pricing')}
            className="bg-gradient-to-r from-primary to-primary/70"
          >
            Upgrade to {tierLabels[requiredTier]}
          </Button>
          {requiredTier === 'pro' && (
            <p className="text-[10px] text-muted-foreground">
              X Subscribers get Pro for just $7.99/mo
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
