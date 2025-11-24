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

      const { data, error } = await supabase
        .from('arb_balances')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setBalance(data);
      } else {
        // Create initial balance record
        const { data: newBalance, error: insertError } = await supabase
          .from('arb_balances')
          .insert({
            user_id: user.id,
            eth_mainnet: 0,
            eth_base: 0,
            base_token_base: 0,
            total_value_usd: 0
          })
          .select()
          .single();

        if (insertError) throw insertError;
        setBalance(newBalance);
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
    await supabase.functions.invoke('arb-refresh-balances');
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ETH on Mainnet</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance.eth_mainnet.toFixed(4)} ETH</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>ETH on Base</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance.eth_base.toFixed(4)} ETH</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>BASE Token on Base</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{balance.base_token_base.toFixed(2)} BASE</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Value</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${balance.total_value_usd.toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Balance Distribution</CardTitle>
          <CardDescription>How your funds are allocated across chains</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">ETH Mainnet</span>
                <span className="text-sm font-medium">
                  {((balance.eth_mainnet / (balance.eth_mainnet + balance.eth_base)) * 100 || 0).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-primary h-full"
                  style={{ width: `${(balance.eth_mainnet / (balance.eth_mainnet + balance.eth_base)) * 100 || 0}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm">ETH Base</span>
                <span className="text-sm font-medium">
                  {((balance.eth_base / (balance.eth_mainnet + balance.eth_base)) * 100 || 0).toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                <div
                  className="bg-accent h-full"
                  style={{ width: `${(balance.eth_base / (balance.eth_mainnet + balance.eth_base)) * 100 || 0}%` }}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
