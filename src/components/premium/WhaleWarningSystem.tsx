import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, TrendingDown, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface WhaleMovement {
  id: string;
  wallet_address: string;
  action: string;
  amount_tokens: number;
  usd_value: number;
  percentage_of_supply: number;
  tier: string;
  detected_at: string;
}

interface WhaleWarningSystemProps {
  tokenMint: string;
}

export const WhaleWarningSystem = ({ tokenMint }: WhaleWarningSystemProps) => {
  const [warnings, setWarnings] = useState<Array<{
    severity: 'high' | 'medium';
    message: string;
    timestamp: string;
  }>>([]);

  useEffect(() => {
    // Subscribe to whale movements
    const checkForDangerousMovements = async () => {
      try {
        const { data } = await supabase
          .from('holder_movements')
          .select('*')
          .eq('token_mint', tokenMint)
          .gte('detected_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // Last 5 minutes
          .order('detected_at', { ascending: false });

        if (!data || data.length === 0) return;

        const newWarnings: Array<{ severity: 'high' | 'medium'; message: string; timestamp: string }> = [];

        // Analyze movements for dangerous patterns
        data.forEach((movement: WhaleMovement) => {
          const { action, percentage_of_supply, usd_value, tier } = movement;

          // High severity: Large whale sell
          if (action === 'sell' && tier === 'True Whale' && percentage_of_supply > 2) {
            newWarnings.push({
              severity: 'high',
              message: `🚨 TRUE WHALE DUMP: ${percentage_of_supply.toFixed(2)}% of supply ($${usd_value.toLocaleString()}) sold`,
              timestamp: movement.detected_at,
            });
          }

          // High severity: Multiple whales selling
          const recentSells = data.filter(
            (m: WhaleMovement) => m.action === 'sell' && ['True Whale', 'Baby Whale', 'Super Boss'].includes(m.tier)
          );
          if (recentSells.length >= 3) {
            newWarnings.push({
              severity: 'high',
              message: `⚠️ MULTIPLE WHALES EXITING: ${recentSells.length} large holders sold recently`,
              timestamp: movement.detected_at,
            });
          }

          // Medium severity: Baby whale or Super Boss sell
          if (action === 'sell' && (tier === 'Baby Whale' || tier === 'Super Boss') && percentage_of_supply > 1) {
            newWarnings.push({
              severity: 'medium',
              message: `⚠️ Large holder selling: ${percentage_of_supply.toFixed(2)}% of supply ($${usd_value.toLocaleString()})`,
              timestamp: movement.detected_at,
            });
          }

          // Medium severity: Concentrated whale accumulation (could be rug prep)
          if (action === 'buy' && tier === 'True Whale' && percentage_of_supply > 3) {
            newWarnings.push({
              severity: 'medium',
              message: `👀 WHALE ACCUMULATION: ${percentage_of_supply.toFixed(2)}% acquired - monitor for potential rug`,
              timestamp: movement.detected_at,
            });
          }
        });

        // Deduplicate and keep only the most recent unique warnings
        const uniqueWarnings = Array.from(
          new Map(newWarnings.map((w) => [w.message, w])).values()
        ).slice(0, 3); // Show max 3 warnings

        setWarnings(uniqueWarnings);
      } catch (error) {
        console.error('Error checking whale movements:', error);
      }
    };

    checkForDangerousMovements();
    const interval = setInterval(checkForDangerousMovements, 30000); // Check every 30s

    return () => clearInterval(interval);
  }, [tokenMint]);

  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((warning, index) => (
        <Alert
          key={index}
          variant={warning.severity === 'high' ? 'destructive' : 'default'}
          className={
            warning.severity === 'high'
              ? 'border-red-500 bg-red-500/10 animate-pulse'
              : 'border-yellow-500 bg-yellow-500/10'
          }
        >
          {warning.severity === 'high' ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
          <AlertTitle className="font-bold">
            {warning.severity === 'high' ? '🔴 CRITICAL WARNING' : '🟡 CAUTION'}
          </AlertTitle>
          <AlertDescription className="text-sm">
            {warning.message}
            <div className="text-xs opacity-70 mt-1">
              {new Date(warning.timestamp).toLocaleTimeString()}
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
};
