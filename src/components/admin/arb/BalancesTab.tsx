import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Balance {
  eth_mainnet: number;
  eth_base: number;
  base_token_base: number;
  usdc_mainnet: number;
  usdc_base: number;
  total_value_usd: number;
  last_updated: string;
}

export function BalancesTab() {
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadBalances();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel('arb-balances-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'arb_balances',
        },
        () => {
          loadBalances();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadBalances = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get config first
      const { data: config } = await supabase
        .from('arb_bot_config')
        .select('*')
        .eq('user_id', user.id)
        .single();

      const { data, error } = await supabase
        .from('arb_balances')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      // Check if balances are all zero and need initialization
      const needsInit = !data || (
        data.eth_mainnet === 0 && 
        data.eth_base === 0 && 
        data.usdc_mainnet === 0 && 
        data.usdc_base === 0 && 
        data.base_token_base === 0
      );

      if (needsInit) {
        const ethPrice = 3000;
        const initialEth = (config?.initial_eth_mainnet || 0) + (config?.initial_eth_base || 0);
        const initialUsdc = (config?.initial_usdc_mainnet || 0) + (config?.initial_usdc_base || 0);
        const totalValue = (initialEth * ethPrice) + initialUsdc + (config?.initial_base_tokens || 0);

        const { data: newBalance, error: upsertError } = await supabase
          .from('arb_balances')
          .upsert({
            user_id: user.id,
            eth_mainnet: config?.initial_eth_mainnet || 0,
            eth_base: config?.initial_eth_base || 0,
            base_token_base: config?.initial_base_tokens || 0,
            usdc_mainnet: config?.initial_usdc_mainnet || 0,
            usdc_base: config?.initial_usdc_base || 0,
            total_value_usd: totalValue
          }, { onConflict: 'user_id' })
          .select()
          .single();

        if (upsertError) throw upsertError;
        setBalance(newBalance);
      } else {
        setBalance(data);
      }
    } catch (error: any) {
      toast({
        title: "Error loading balances",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshBalances = async () => {
    setRefreshing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get config for initial values
      const { data: config } = await supabase
        .from('arb_bot_config')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (config?.dry_run_enabled) {
        // In dry-run mode, reset to initial balances
        const ethPrice = 3000;
        const initialEth = (config.initial_eth_mainnet || 0) + (config.initial_eth_base || 0);
        const initialUsdc = (config.initial_usdc_mainnet || 0) + (config.initial_usdc_base || 0);
        const totalValue = (initialEth * ethPrice) + initialUsdc + (config.initial_base_tokens || 0);

        await supabase
          .from('arb_balances')
          .upsert({
            user_id: user.id,
            eth_mainnet: config.initial_eth_mainnet || 0,
            eth_base: config.initial_eth_base || 0,
            base_token_base: config.initial_base_tokens || 0,
            usdc_mainnet: config.initial_usdc_mainnet || 0,
            usdc_base: config.initial_usdc_base || 0,
            total_value_usd: totalValue
          }, { onConflict: 'user_id' });

        toast({
          title: "Balances reset",
          description: "Virtual balances reset to initial config values"
        });
      } else {
        // Real mode - call the refresh function
        await supabase.functions.invoke('arb-refresh-balances');
      }
    } catch (error: any) {
      toast({
        title: "Error refreshing",
        description: error.message,
        variant: "destructive"
      });
    }
    await loadBalances();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!balance) return null;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Current Balances</h3>
          <p className="text-sm text-muted-foreground">
            Last updated: {new Date(balance.last_updated).toLocaleString()}
          </p>
        </div>
        <Button onClick={refreshBalances} disabled={refreshing} variant="outline">
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>USDC (Mainnet)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${balance.usdc_mainnet.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">Available to deploy</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>USDC (Base)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${balance.usdc_base.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ETH (Mainnet)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance.eth_mainnet.toFixed(4)} ETH</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ETH (Base)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance.eth_base.toFixed(4)} ETH</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>BASE Token</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance.base_token_base.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="bg-primary/5">
          <CardHeader className="pb-2">
            <CardDescription>Total Portfolio Value</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${balance.total_value_usd.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Portfolio Allocation</CardTitle>
          <CardDescription>Asset distribution across chains and currencies</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">USDC (Total)</span>
                <span className="text-sm">${(balance.usdc_mainnet + balance.usdc_base).toFixed(2)}</span>
                <span className="text-sm text-muted-foreground">
                  {(((balance.usdc_mainnet + balance.usdc_base) / balance.total_value_usd) * 100 || 0).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-green-500 h-full transition-all"
                  style={{ width: `${((balance.usdc_mainnet + balance.usdc_base) / balance.total_value_usd) * 100 || 0}%` }}
                />
              </div>
              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                <span>Mainnet: ${balance.usdc_mainnet.toFixed(2)}</span>
                <span>Base: ${balance.usdc_base.toFixed(2)}</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">ETH (Total)</span>
                <span className="text-sm">{(balance.eth_mainnet + balance.eth_base).toFixed(4)} ETH</span>
                <span className="text-sm text-muted-foreground">
                  {(((balance.eth_mainnet + balance.eth_base) * 3000) / balance.total_value_usd * 100 || 0).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full transition-all"
                  style={{ width: `${((balance.eth_mainnet + balance.eth_base) * 3000) / balance.total_value_usd * 100 || 0}%` }}
                />
              </div>
              <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                <span>Mainnet: {balance.eth_mainnet.toFixed(4)}</span>
                <span>Base: {balance.eth_base.toFixed(4)}</span>
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium">BASE Token</span>
                <span className="text-sm">{balance.base_token_base.toFixed(2)} BASE</span>
                <span className="text-sm text-muted-foreground">
                  {((balance.base_token_base / balance.total_value_usd) * 100 || 0).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-accent h-full transition-all"
                  style={{ width: `${(balance.base_token_base / balance.total_value_usd) * 100 || 0}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deployment Status</CardTitle>
            <CardDescription>How much capital is deployed vs. available</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Available USDC</span>
              <span className="text-sm font-bold text-green-600">${(balance.usdc_mainnet + balance.usdc_base).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Deployed in Positions</span>
              <span className="text-sm font-bold">
                ${((balance.eth_mainnet + balance.eth_base) * 3000 + balance.base_token_base).toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between pt-2 border-t">
              <span className="text-sm font-medium">Total Portfolio</span>
              <span className="text-sm font-bold">${balance.total_value_usd.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Strategy Summary</CardTitle>
            <CardDescription>Current trading strategy status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm">Reserve %</span>
              <span className="text-sm font-medium">
                {(((balance.usdc_mainnet + balance.usdc_base) / balance.total_value_usd) * 100 || 0).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm">Deployed %</span>
              <span className="text-sm font-medium">
                {((1 - (balance.usdc_mainnet + balance.usdc_base) / balance.total_value_usd) * 100 || 0).toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground pt-2">
              Bot will deploy USDC when opportunities arise and take profits back to USDC
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
