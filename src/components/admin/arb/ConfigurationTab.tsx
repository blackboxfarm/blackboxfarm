import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Activity, Play, Square } from "lucide-react";

interface BotConfig {
  trade_size_mode: string;
  trade_size_fixed_eth: number;
  trade_size_pct_balance: number;
  min_profit_bps: number;
  max_slippage_bps_per_hop: number;
  max_price_impact_bps: number;
  max_gas_per_tx_eth: number;
  max_gas_per_tx_base: number;
  max_bridge_fee_pct: number;
  max_loss_per_trade_eth: number;
  max_daily_loss_eth: number;
  max_daily_trades: number;
  max_open_loops: number;
  enable_loop_a: boolean;
  enable_loop_b: boolean;
  enable_loop_c: boolean;
  auto_trade_enabled: boolean;
  dry_run_enabled: boolean;
  circuit_breaker_active: boolean;
  rebalance_mode: boolean;
  polling_interval_sec: number;
  stale_quote_timeout_sec: number;
}

interface BotStatus {
  is_running: boolean;
  status: 'idle' | 'scanning' | 'executing' | 'error' | 'stopped';
  last_scan_at: string | null;
  next_scan_at: string | null;
  scan_count_today: number;
  error_message: string | null;
}

export function ConfigurationTab() {
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
    loadBotStatus();

    // Subscribe to bot status changes
    const channel = supabase
      .channel('arb-bot-status-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'arb_bot_status',
        },
        () => {
          loadBotStatus();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadBotStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('arb_bot_status')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setBotStatus(data as BotStatus);
      } else {
        // Create initial bot status
        const { data: newStatus, error: createError } = await supabase
          .from('arb_bot_status')
          .insert({ user_id: user.id })
          .select()
          .single();

        if (createError) throw createError;
        setBotStatus(newStatus as BotStatus);
      }
    } catch (error: any) {
      console.error('Error loading bot status:', error);
    }
  };

  const loadConfig = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('arb_bot_config')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setConfig(data);
      } else {
        // Create default config
        const defaultConfig = {
          user_id: user.id,
          trade_size_mode: 'fixed',
          trade_size_fixed_eth: 0.1,
          trade_size_pct_balance: 10,
          min_profit_bps: 50,
          max_slippage_bps_per_hop: 50,
          max_price_impact_bps: 100,
          max_gas_per_tx_eth: 0.01,
          max_gas_per_tx_base: 0.001,
          max_bridge_fee_pct: 0.5,
          max_loss_per_trade_eth: 0.05,
          max_daily_loss_eth: 0.5,
          max_daily_trades: 50,
          max_open_loops: 3,
          enable_loop_a: true,
          enable_loop_b: true,
          enable_loop_c: false,
          auto_trade_enabled: true,
          dry_run_enabled: true,
          circuit_breaker_active: false,
          rebalance_mode: false,
          polling_interval_sec: 60,
          stale_quote_timeout_sec: 10
        };

        const { data: newConfig, error: insertError } = await supabase
          .from('arb_bot_config')
          .insert(defaultConfig)
          .select()
          .single();

        if (insertError) throw insertError;
        setConfig(newConfig);
      }
    } catch (error: any) {
      toast({
        title: "Error loading configuration",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const startBot = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('arb_bot_status')
        .update({ is_running: true, status: 'idle' })
        .eq('user_id', user.id);

      toast({
        title: "Bot Started",
        description: "Arbitrage bot is now running",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const stopBot = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('arb_bot_status')
        .update({ is_running: false, status: 'stopped' })
        .eq('user_id', user.id);

      toast({
        title: "Bot Stopped",
        description: "Arbitrage bot has been stopped",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('arb_bot_config')
        .update(config)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Configuration saved",
        description: "Your bot configuration has been updated successfully."
      });
    } catch (error: any) {
      toast({
        title: "Error saving configuration",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!config) return null;

  const getStatusBadge = () => {
    if (!botStatus) return null;
    
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      idle: { label: "Idle", variant: "secondary" },
      scanning: { label: "Scanning", variant: "default" },
      executing: { label: "Executing", variant: "default" },
      error: { label: "Error", variant: "destructive" },
      stopped: { label: "Stopped", variant: "outline" },
    };

    const status = variants[botStatus.status] || variants.stopped;
    return <Badge variant={status.variant}>{status.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Bot Control Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Bot Control
              </CardTitle>
              <CardDescription>Start or stop the arbitrage bot</CardDescription>
            </div>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button
              onClick={startBot}
              disabled={botStatus?.is_running}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Start Bot
            </Button>
            <Button
              onClick={stopBot}
              disabled={!botStatus?.is_running}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <Square className="h-4 w-4" />
              Stop Bot
            </Button>
          </div>

          {botStatus && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <Label className="text-sm text-muted-foreground">Last Scan</Label>
                <p className="text-sm font-medium">
                  {botStatus.last_scan_at 
                    ? new Date(botStatus.last_scan_at).toLocaleTimeString() 
                    : 'Never'}
                </p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Next Scan</Label>
                <p className="text-sm font-medium">
                  {botStatus.next_scan_at 
                    ? new Date(botStatus.next_scan_at).toLocaleTimeString() 
                    : 'N/A'}
                </p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Scans Today</Label>
                <p className="text-sm font-medium">{botStatus.scan_count_today}</p>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Status</Label>
                <p className="text-sm font-medium capitalize">{botStatus.status}</p>
              </div>
            </div>
          )}

          {botStatus?.error_message && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              Error: {botStatus.error_message}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Trade Size Configuration</CardTitle>
          <CardDescription>Configure how much to trade per arbitrage opportunity</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Trade Size Mode</Label>
            <Select
              value={config.trade_size_mode}
              onValueChange={(value) => setConfig({ ...config, trade_size_mode: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed ETH Amount</SelectItem>
                <SelectItem value="percentage">Percentage of Balance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {config.trade_size_mode === 'fixed' && (
            <div className="space-y-2">
              <Label>Fixed Trade Size (ETH)</Label>
              <Input
                type="number"
                step="0.01"
                value={config.trade_size_fixed_eth}
                onChange={(e) => setConfig({ ...config, trade_size_fixed_eth: parseFloat(e.target.value) })}
              />
            </div>
          )}

          {config.trade_size_mode === 'percentage' && (
            <div className="space-y-2">
              <Label>Percentage of Balance (%)</Label>
              <Input
                type="number"
                step="1"
                value={config.trade_size_pct_balance}
                onChange={(e) => setConfig({ ...config, trade_size_pct_balance: parseFloat(e.target.value) })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profit & Risk Thresholds</CardTitle>
          <CardDescription>Set minimum profit and maximum risk parameters</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Min Profit (basis points)</Label>
              <Input
                type="number"
                value={config.min_profit_bps}
                onChange={(e) => setConfig({ ...config, min_profit_bps: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Slippage per Hop (bps)</Label>
              <Input
                type="number"
                value={config.max_slippage_bps_per_hop}
                onChange={(e) => setConfig({ ...config, max_slippage_bps_per_hop: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Price Impact (bps)</Label>
              <Input
                type="number"
                value={config.max_price_impact_bps}
                onChange={(e) => setConfig({ ...config, max_price_impact_bps: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Loss per Trade (ETH)</Label>
              <Input
                type="number"
                step="0.01"
                value={config.max_loss_per_trade_eth}
                onChange={(e) => setConfig({ ...config, max_loss_per_trade_eth: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gas & Fee Limits</CardTitle>
          <CardDescription>Maximum gas and bridge fee configurations</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Gas per TX - ETH (ETH)</Label>
              <Input
                type="number"
                step="0.001"
                value={config.max_gas_per_tx_eth}
                onChange={(e) => setConfig({ ...config, max_gas_per_tx_eth: parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Gas per TX - Base (ETH)</Label>
              <Input
                type="number"
                step="0.0001"
                value={config.max_gas_per_tx_base}
                onChange={(e) => setConfig({ ...config, max_gas_per_tx_base: parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Bridge Fee (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={config.max_bridge_fee_pct}
                onChange={(e) => setConfig({ ...config, max_bridge_fee_pct: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daily Limits & Circuit Breakers</CardTitle>
          <CardDescription>Protect against excessive losses and trading</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Daily Loss (ETH)</Label>
              <Input
                type="number"
                step="0.1"
                value={config.max_daily_loss_eth}
                onChange={(e) => setConfig({ ...config, max_daily_loss_eth: parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Daily Trades</Label>
              <Input
                type="number"
                value={config.max_daily_trades}
                onChange={(e) => setConfig({ ...config, max_daily_trades: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Max Open Loops</Label>
              <Input
                type="number"
                value={config.max_open_loops}
                onChange={(e) => setConfig({ ...config, max_open_loops: parseInt(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Loop Selection</CardTitle>
          <CardDescription>Enable or disable specific arbitrage loops</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Loop A: ETH Mainnet → Base → ETH Mainnet</Label>
            <Switch
              checked={config.enable_loop_a}
              onCheckedChange={(checked) => setConfig({ ...config, enable_loop_a: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Loop B: BASE Token Arbitrage on Base</Label>
            <Switch
              checked={config.enable_loop_b}
              onCheckedChange={(checked) => setConfig({ ...config, enable_loop_b: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>Loop C: Cross-chain BASE Token Arb</Label>
            <Switch
              checked={config.enable_loop_c}
              onCheckedChange={(checked) => setConfig({ ...config, enable_loop_c: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bot Controls</CardTitle>
          <CardDescription>Enable/disable core bot functionality</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Trade Enabled</Label>
              <p className="text-sm text-muted-foreground">Automatically execute profitable opportunities</p>
            </div>
            <Switch
              checked={config.auto_trade_enabled}
              onCheckedChange={(checked) => setConfig({ ...config, auto_trade_enabled: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Dry Run Mode</Label>
              <p className="text-sm text-muted-foreground">Simulate trades without executing</p>
            </div>
            <Switch
              checked={config.dry_run_enabled}
              onCheckedChange={(checked) => setConfig({ ...config, dry_run_enabled: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Circuit Breaker</Label>
              <p className="text-sm text-muted-foreground">Emergency stop all trading</p>
            </div>
            <Switch
              checked={config.circuit_breaker_active}
              onCheckedChange={(checked) => setConfig({ ...config, circuit_breaker_active: checked })}
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Rebalance Mode</Label>
              <p className="text-sm text-muted-foreground">Automatically rebalance across chains</p>
            </div>
            <Switch
              checked={config.rebalance_mode}
              onCheckedChange={(checked) => setConfig({ ...config, rebalance_mode: checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timing Configuration</CardTitle>
          <CardDescription>Polling and timeout settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Polling Interval (seconds)</Label>
              <Input
                type="number"
                value={config.polling_interval_sec}
                onChange={(e) => setConfig({ ...config, polling_interval_sec: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label>Stale Quote Timeout (seconds)</Label>
              <Input
                type="number"
                value={config.stale_quote_timeout_sec}
                onChange={(e) => setConfig({ ...config, stale_quote_timeout_sec: parseInt(e.target.value) })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveConfig} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Configuration
        </Button>
      </div>
    </div>
  );
}
