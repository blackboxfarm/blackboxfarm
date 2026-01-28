import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, Sparkles, TrendingUp, Shield, AlertTriangle, Users } from 'lucide-react';
import { AuthModal } from '@/components/auth/AuthModal';
import { StabilityScoreCard } from './StabilityScoreCard';
import { SecurityAlertsCard } from './SecurityAlertsCard';
import { Top25HoldersCard } from './Top25HoldersCard';
import { LiquiditySupplyCard } from './LiquiditySupplyCard';
import { WhaleWarningSystem } from '@/components/premium/WhaleWarningSystem';
import { HolderMovementFeed } from '@/components/premium/HolderMovementFeed';
import { RetentionAnalysis } from '@/components/premium/RetentionAnalysis';
import { FeatureThumbnailGallery } from './FeatureThumbnailGallery';

interface TokenHolder {
  owner: string;
  balance: number;
  usdValue: number;
  percentageOfSupply: number;
  isLiquidityPool: boolean;
}

interface PotentialDevWallet {
  address: string;
  balance: number;
  usdValue: number;
  percentageOfSupply: number;
  confidence: number;
  reason: string;
}

interface StabilityData {
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  emoji: string;
  label: string;
  whalePercentage: number;
  breakdown: {
    whaleScore: number;
    distributionScore: number;
    lpScore: number;
    holderCountScore: number;
  };
}

interface SecurityAlert {
  type: 'critical' | 'warning' | 'info';
  message: string;
  flagged?: boolean;
}

interface LPAnalysisData {
  lpPercentage: number;
  unlockedSupply: number;
  unlockedPercentage: number;
  lpBalance: number;
}

interface ExtendedAnalysisSectionProps {
  tokenMint: string;
  tokenAge?: number;
  holders: TokenHolder[];
  potentialDevWallet?: PotentialDevWallet;
  walletFlags: { [address: string]: { flag: 'dev' | 'team' | 'suspicious'; timestamp: number } };
  onFlagWallet: (address: string) => void;
  stabilityData: StabilityData;
  securityAlerts: SecurityAlert[];
  lpAnalysis: LPAnalysisData;
  liquidityPoolsDetected: number;
}

export function ExtendedAnalysisSection({
  tokenMint,
  tokenAge,
  holders,
  potentialDevWallet,
  walletFlags,
  onFlagWallet,
  stabilityData,
  securityAlerts,
  lpAnalysis,
  liquidityPoolsDetected,
}: ExtendedAnalysisSectionProps) {
  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = React.useState(false);

  // Not logged in - show teaser
  if (!user) {
    return (
      <>
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 via-background to-primary/10 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
          <CardContent className="py-8 text-center relative z-10">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center border border-primary/20">
              <Lock className="h-8 w-8 text-primary/70" />
            </div>
            <h3 className="font-semibold text-lg mb-2 text-foreground">Extended Analysis</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Sign in to unlock detailed holder insights, whale movement alerts, security analysis, and retention metrics.
            </p>
            
            {/* Feature Preview Pills */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-full text-xs">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span>Stability Score</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-full text-xs">
                <AlertTriangle className="h-3 w-3 text-orange-500" />
                <span>Security Alerts</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-full text-xs">
                <Users className="h-3 w-3 text-blue-500" />
                <span>Top 25 Analysis</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 rounded-full text-xs">
                <Shield className="h-3 w-3 text-purple-500" />
                <span>Whale Alerts</span>
              </div>
            </div>
            
            {/* Feature Preview Thumbnails */}
            <FeatureThumbnailGallery />
            
            
            <Button 
              onClick={() => setShowAuthModal(true)}
              className="bg-primary hover:bg-primary/90"
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Sign up for free
            </Button>
          </CardContent>
        </Card>
        
        <AuthModal 
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          defaultTab="signin"
        />
      </>
    );
  }

  // Logged in - show full extended analysis
  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Extended Analysis</h2>
          <p className="text-xs text-muted-foreground">Deep insights for logged-in users</p>
        </div>
      </div>

      {/* Stability Score */}
      <StabilityScoreCard data={stabilityData} />

      {/* Security Alerts */}
      {securityAlerts.length > 0 && (
        <SecurityAlertsCard alerts={securityAlerts} />
      )}

      {/* Top 25 Holders */}
      <Top25HoldersCard 
        holders={holders}
        potentialDevWallet={potentialDevWallet}
        walletFlags={walletFlags}
        onFlagWallet={onFlagWallet}
      />

      {/* Liquidity vs Supply */}
      {liquidityPoolsDetected > 0 && (
        <LiquiditySupplyCard data={lpAnalysis} />
      )}

      {/* Real-Time Whale Movements */}
      {tokenMint && (
        <>
          <WhaleWarningSystem tokenMint={tokenMint} />
          <HolderMovementFeed tokenMint={tokenMint} hideWhenEmpty={false} tokenAge={tokenAge} />
        </>
      )}

      {/* Retention Analysis */}
      {tokenMint && (
        <RetentionAnalysis tokenMint={tokenMint} tokenAge={tokenAge} />
      )}
    </div>
  );
}
