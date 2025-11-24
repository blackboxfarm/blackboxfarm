import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PriceFeedWidget } from "./PriceFeedWidget";
import { LoopDiagram } from "./LoopDiagram";
import { TradeSimulator } from "./TradeSimulator";
import { LiveActivityMonitor } from "./LiveActivityMonitor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export const OverviewTab = () => {
  const [latestPrices, setLatestPrices] = useState<any>(null);
  const [botStatus, setBotStatus] = useState<any>(null);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    // Load latest prices
    const { data: priceData } = await supabase
      .from("arb_price_snapshots")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    if (priceData) {
      setLatestPrices(priceData);
    }

    // Load bot status
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: statusData } = await supabase
        .from("arb_bot_status")
        .select("*")
        .eq("user_id", user.id)
        .single();

      setBotStatus(statusData);

      // Load recent opportunities
      const { data: oppsData } = await supabase
        .from("arb_opportunities")
        .select("*")
        .eq("user_id", user.id)
        .eq("executable", true)
        .order("detected_at", { ascending: false })
        .limit(5);

      setOpportunities(oppsData || []);
    }
  };

  return (
    <div className="space-y-6">
      {/* Price Feed */}
      <PriceFeedWidget />

      {/* Bot Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Bot Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="flex items-center gap-2">
                {botStatus?.is_running ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                      Running
                    </Badge>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    <Badge variant="secondary">Stopped</Badge>
                  </>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Scans Today</p>
              <p className="text-2xl font-bold">{botStatus?.scan_count_today || 0}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Active Opportunities</p>
              <p className="text-2xl font-bold">{opportunities.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Live Activity Monitor */}
      <LiveActivityMonitor />

      {/* Trade Simulator */}
      {latestPrices && (
        <TradeSimulator
          ethMainnetPrice={latestPrices.eth_mainnet_usd}
          ethBasePrice={latestPrices.eth_base_usd}
          baseTokenPrice={latestPrices.base_token_usd}
        />
      )}

      {/* Loop Diagrams */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Arbitrage Strategy Flowcharts</h3>
        <div className="grid grid-cols-1 gap-4">
          <LoopDiagram 
            loopType="A" 
            ethMainnetPrice={latestPrices?.eth_mainnet_usd}
            ethBasePrice={latestPrices?.eth_base_usd}
            baseTokenPrice={latestPrices?.base_token_usd}
          />
          <LoopDiagram 
            loopType="B"
            ethMainnetPrice={latestPrices?.eth_mainnet_usd}
            ethBasePrice={latestPrices?.eth_base_usd}
            baseTokenPrice={latestPrices?.base_token_usd}
          />
          <LoopDiagram 
            loopType="C"
            ethMainnetPrice={latestPrices?.eth_mainnet_usd}
            ethBasePrice={latestPrices?.eth_base_usd}
            baseTokenPrice={latestPrices?.base_token_usd}
          />
        </div>
      </div>
    </div>
  );
};
