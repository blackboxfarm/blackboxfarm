import { ReactNode, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';

interface PremiumFeatureGateProps {
  isAuthenticated: boolean;
  featureName: string;
  featureDescription: string;
  featureIcon: ReactNode;
  children: ReactNode;
  onSignUpClick: () => void;
  tokenMint?: string;
}

export const PremiumFeatureGate = ({
  isAuthenticated,
  featureName,
  featureDescription,
  featureIcon,
  children,
  onSignUpClick,
  tokenMint,
}: PremiumFeatureGateProps) => {
  const { trackView } = useFeatureTracking(featureName, tokenMint);

  useEffect(() => {
    if (!isAuthenticated) {
      trackView(true);
    }
  }, [isAuthenticated, trackView]);

  if (!isAuthenticated) {
    return (
      <Card className="relative overflow-hidden tech-border">
        {/* Blurred preview */}
        <div className="filter blur-md opacity-20 pointer-events-none select-none">
          {children}
        </div>
        
        {/* Overlay with CTA */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/90 to-background z-10 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-5xl mb-4 animate-pulse">{featureIcon}</div>
          <h3 className="text-2xl md:text-3xl font-bold mb-2 tech-gradient bg-clip-text text-transparent">
            {featureName}
          </h3>
          <p className="text-muted-foreground mb-6 max-w-md text-sm md:text-base">
            {featureDescription}
          </p>
          <Button onClick={onSignUpClick} size="lg" className="tech-button mb-3">
            🚀 Create Free Account to Unlock
          </Button>
          <p className="text-xs text-muted-foreground">
            No credit card required • Takes 30 seconds • Track your analytics
          </p>
        </div>
      </Card>
    );
  }

  return <>{children}</>;
};
