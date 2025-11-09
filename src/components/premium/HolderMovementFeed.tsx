import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useFeatureTracking } from '@/hooks/useFeatureTracking';

interface Movement {
  id: string;
  wallet_address: string;
  action: string;
  amount_tokens: number;
  usd_value: number;
  percentage_of_supply: number;
  tier: string;
  detected_at: string;
}

interface HolderMovementFeedProps {
  tokenMint: string;
  hideWhenEmpty?: boolean;
  tokenAge?: number; // Age in hours
}

export const HolderMovementFeed = ({ tokenMint, hideWhenEmpty = false, tokenAge }: HolderMovementFeedProps) => {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'whales'>('all');
  const { trackView } = useFeatureTracking('holder_movements', tokenMint);

  // Hide if too young and empty
  const isTooYoung = tokenAge !== undefined && tokenAge < 24;
  const shouldHide = hideWhenEmpty && movements.length === 0 && !loading;

  useEffect(() => {
    trackView();
  }, [trackView]);

  const fetchMovements = async () => {
    setLoading(true);
    try {
      // Call edge function to detect movements
      const { data, error } = await supabase.functions.invoke('track-holder-movements', {
        body: { token_mint: tokenMint },
      });

      if (error) throw error;

      setMovements(data.movements || []);
    } catch (error) {
      console.error('Error fetching movements:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovements();
    const interval = setInterval(fetchMovements, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [tokenMint]);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'buy': return 'text-green-500 bg-green-500/10 border-green-500/20';
      case 'sell': return 'text-red-500 bg-red-500/10 border-red-500/20';
      case 'accumulate': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
      case 'distribute': return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
      default: return 'text-muted-foreground';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'buy':
      case 'accumulate':
        return <ArrowUpRight className="w-4 h-4" />;
      case 'sell':
      case 'distribute':
        return <ArrowDownRight className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const filteredMovements = movements.filter(m => 
    filter === 'all' || (filter === 'whales' && m.tier === 'Whale')
  );

  // Hide component if empty and configured to hide
  if (shouldHide) {
    return null;
  }

  // Show "too young" message for new tokens
  if (isTooYoung && movements.length === 0 && !loading) {
    return (
      <Card className="tech-border border-yellow-500/30 bg-yellow-500/5">
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">
            ⏰ <strong>New Token</strong> - Whale activity tracking available after 24 hours
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            (This is expected for new launches - whales typically enter later)
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="tech-border">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Real-Time Whale Movements
            </CardTitle>
            <CardDescription>Live tracking of significant holder activity (last 48h)</CardDescription>
          </div>
          <Button onClick={fetchMovements} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Filter controls */}
        <div className="flex gap-2">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All Tiers
          </Button>
          <Button
            variant={filter === 'whales' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('whales')}
          >
            Whales Only
          </Button>
        </div>

        {/* Movements feed */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {loading && movements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p>Detecting movements...</p>
            </div>
          ) : filteredMovements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No significant movements detected in the last 48 hours</p>
            </div>
          ) : (
            filteredMovements.map((movement) => (
              <div
                key={movement.id}
                className={`p-3 rounded-lg border ${getActionColor(movement.action)} transition-all hover:scale-[1.02]`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getActionIcon(movement.action)}
                      <Badge variant="outline" className="text-xs">
                        {movement.tier}
                      </Badge>
                      <span className="text-xs font-mono truncate">
                        {movement.wallet_address.slice(0, 4)}...{movement.wallet_address.slice(-4)}
                      </span>
                    </div>
                    <div className="text-sm font-semibold">
                      {movement.action.toUpperCase()}: ${movement.usd_value.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {movement.amount_tokens.toLocaleString()} tokens ({movement.percentage_of_supply.toFixed(3)}% of supply)
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(movement.detected_at).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};
