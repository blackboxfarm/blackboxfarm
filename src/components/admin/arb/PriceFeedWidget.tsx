import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PriceSnapshot {
  eth_mainnet_usd: number;
  eth_base_usd: number;
  base_token_usd: number;
  base_token_eth: number;
  timestamp: string;
}

export const PriceFeedWidget = () => {
  const [prices, setPrices] = useState<PriceSnapshot | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { toast } = useToast();

  const loadPrices = async () => {
    const { data, error } = await supabase
      .from("arb_price_snapshots")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    if (error) {
      toast({
        title: "Error loading prices",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    if (data) {
      setPrices(data);
      setLastUpdate(new Date());
    }
  };

  useEffect(() => {
    loadPrices();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('price-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'arb_price_snapshots'
        },
        (payload) => {
          setPrices(payload.new as PriceSnapshot);
          setLastUpdate(new Date());
        }
      )
      .subscribe();

    // Refresh every 30 seconds
    const interval = setInterval(loadPrices, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  if (!prices) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Live Market Prices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading prices...</p>
        </CardContent>
      </Card>
    );
  }

  const ethSpread = Math.abs(prices.eth_mainnet_usd - prices.eth_base_usd);
  const ethSpreadPct = (ethSpread / prices.eth_mainnet_usd) * 100;
  const isArbitrageOpportunity = ethSpreadPct > 0.1;

  const getTimeSinceUpdate = () => {
    if (!lastUpdate) return "N/A";
    const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Live Market Prices
          </div>
          <Badge variant="outline" className="text-xs">
            Updated {getTimeSinceUpdate()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* ETH Mainnet */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">ETH (Mainnet)</p>
            <p className="text-2xl font-bold">${prices.eth_mainnet_usd.toFixed(2)}</p>
          </div>

          {/* ETH Base */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">ETH (Base)</p>
            <p className="text-2xl font-bold">${prices.eth_base_usd.toFixed(2)}</p>
          </div>

          {/* BASE Token */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">BASE Token</p>
            <p className="text-2xl font-bold">${prices.base_token_usd.toFixed(4)}</p>
          </div>

          {/* Spread */}
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">ETH Spread</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">
                {ethSpreadPct.toFixed(2)}%
              </p>
              {isArbitrageOpportunity ? (
                <TrendingUp className="h-5 w-5 text-green-500" />
              ) : (
                <TrendingDown className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            {isArbitrageOpportunity && (
              <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                Opportunity Detected
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
