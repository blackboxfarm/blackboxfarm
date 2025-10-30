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
      <Card className="relative overflow-hidden tech-border mb-4">
        {/* Blurred preview */}
        <div className="filter blur-md opacity-20 pointer-events-none select-none">
          {children}
        </div>
        
        {/* Overlay with CTA */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/90 to-background z-10 flex flex-col items-center justify-center p-3 md:p-6 text-center">
          <div className="text-3xl md:text-5xl mb-2 md:mb-4 animate-pulse">{featureIcon}</div>
          <h3 className="text-lg md:text-2xl font-bold mb-1 md:mb-2 tech-gradient bg-clip-text text-transparent">
            {featureName}
          </h3>
          <p className="text-muted-foreground mb-3 md:mb-6 max-w-md text-xs md:text-base">
            {featureDescription}
          </p>
          <Button onClick={onSignUpClick} size="sm" className="tech-button mb-2 md:mb-3 text-xs md:text-sm h-8 md:h-10">
            🚀 Create Free Account to Unlock
          </Button>
          <p className="text-[10px] md:text-xs text-muted-foreground">
            No credit card required • Takes 30 seconds • Track your analytics
          </p>
        </div>
      </Card>
    );
  }

  return <>{children}</>;
};
