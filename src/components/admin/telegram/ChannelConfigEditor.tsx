import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Save, Loader2, AlertTriangle, Target, FlaskConical, Wallet, Crown, Zap } from 'lucide-react';
import { useSolPrice } from '@/hooks/useSolPrice';

interface FlipItWallet {
  id: string;
  label: string;
  pubkey: string;
  is_active: boolean;
}

interface ChannelConfig {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_username: string | null;
  flipit_enabled: boolean;
  flipit_buy_amount_usd: number;
  flipit_buy_amount_sol?: number | null;
  flipit_sell_multiplier: number;
  flipit_max_daily_positions: number;
  flipit_wallet_id: string | null;
  flipit_moonbag_enabled?: boolean;
  flipit_moonbag_sell_pct?: number;
  flipit_moonbag_keep_pct?: number;
  scalp_mode_enabled?: boolean;
  scalp_test_mode?: boolean;
  scalp_buy_amount_usd?: number;
  scalp_buy_amount_sol?: number | null;
  scalp_min_bonding_pct?: number;
  scalp_max_bonding_pct?: number;
  scalp_max_age_minutes?: number;
  scalp_min_callers?: number;
  scalp_caller_timeout_seconds?: number;
  scalp_take_profit_pct?: number;
  scalp_moon_bag_pct?: number;
  scalp_stop_loss_pct?: number;
  scalp_buy_slippage_bps?: number;
  scalp_sell_slippage_bps?: number;
  scalp_buy_priority_fee?: string;
  scalp_sell_priority_fee?: string;
  kingkong_mode_enabled?: boolean;
  kingkong_trigger_source?: 'whale_name' | 'username';
  kingkong_quick_amount_usd?: number;
  kingkong_quick_multiplier?: number;
  kingkong_diamond_amount_usd?: number;
  kingkong_diamond_trailing_stop_pct?: number;
  kingkong_diamond_min_peak_x?: number;
  kingkong_diamond_max_hold_hours?: number;
  kingkong_diamond_stop_urgency?: 'normal' | 'aggressive' | 'max';
}

interface ChannelConfigEditorProps {
  channel: ChannelConfig;
  flipitWallets: FlipItWallet[];
  onSaved: () => void;
  section: 'flipit' | 'scalp' | 'kingkong';
}

export function ChannelConfigEditor({ channel, flipitWallets, onSaved, section }: ChannelConfigEditorProps) {
  const { price: solPrice } = useSolPrice();
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Local state for all editable fields
  const [localConfig, setLocalConfig] = useState({
    // FlipIt
    flipit_wallet_id: channel.flipit_wallet_id,
    flipit_buy_amount_sol: channel.flipit_buy_amount_sol ?? (channel.flipit_buy_amount_usd ? channel.flipit_buy_amount_usd / solPrice : 0.1),
    flipit_buy_amount_usd: channel.flipit_buy_amount_usd,
    flipit_sell_multiplier: channel.flipit_sell_multiplier || 2,
    flipit_max_daily_positions: channel.flipit_max_daily_positions || 5,
    flipit_moonbag_enabled: channel.flipit_moonbag_enabled !== false,
    flipit_moonbag_sell_pct: channel.flipit_moonbag_sell_pct || 90,
    flipit_moonbag_keep_pct: channel.flipit_moonbag_keep_pct || 10,
    // Scalp
    scalp_test_mode: channel.scalp_test_mode !== false,
    scalp_buy_amount_sol: channel.scalp_buy_amount_sol ?? (channel.scalp_buy_amount_usd ? channel.scalp_buy_amount_usd / solPrice : 0.05),
    scalp_buy_amount_usd: channel.scalp_buy_amount_usd,
    scalp_min_bonding_pct: channel.scalp_min_bonding_pct ?? 2,
    scalp_max_bonding_pct: channel.scalp_max_bonding_pct ?? 50,
    scalp_max_age_minutes: channel.scalp_max_age_minutes ?? 10,
    scalp_min_callers: channel.scalp_min_callers ?? 2,
    scalp_caller_timeout_seconds: channel.scalp_caller_timeout_seconds ?? 60,
    scalp_take_profit_pct: channel.scalp_take_profit_pct ?? 100,
    scalp_moon_bag_pct: channel.scalp_moon_bag_pct ?? 10,
    scalp_stop_loss_pct: channel.scalp_stop_loss_pct ?? 25,
    scalp_buy_slippage_bps: channel.scalp_buy_slippage_bps ?? 1000,
    scalp_sell_slippage_bps: channel.scalp_sell_slippage_bps ?? 2500,
    scalp_buy_priority_fee: channel.scalp_buy_priority_fee ?? 'high',
    scalp_sell_priority_fee: channel.scalp_sell_priority_fee ?? 'veryHigh',
    // KingKong
    kingkong_trigger_source: channel.kingkong_trigger_source || 'whale_name',
    kingkong_quick_amount_usd: channel.kingkong_quick_amount_usd ?? 25,
    kingkong_quick_multiplier: channel.kingkong_quick_multiplier ?? 2,
    kingkong_diamond_amount_usd: channel.kingkong_diamond_amount_usd ?? 100,
    kingkong_diamond_trailing_stop_pct: channel.kingkong_diamond_trailing_stop_pct ?? 25,
    kingkong_diamond_min_peak_x: channel.kingkong_diamond_min_peak_x ?? 5,
    kingkong_diamond_max_hold_hours: channel.kingkong_diamond_max_hold_hours ?? 24,
    kingkong_diamond_stop_urgency: channel.kingkong_diamond_stop_urgency || 'normal',
  });

  // Reset local config when channel changes
  useEffect(() => {
    setLocalConfig({
      flipit_wallet_id: channel.flipit_wallet_id,
      flipit_buy_amount_sol: channel.flipit_buy_amount_sol ?? (channel.flipit_buy_amount_usd ? channel.flipit_buy_amount_usd / solPrice : 0.1),
      flipit_buy_amount_usd: channel.flipit_buy_amount_usd,
      flipit_sell_multiplier: channel.flipit_sell_multiplier || 2,
      flipit_max_daily_positions: channel.flipit_max_daily_positions || 5,
      flipit_moonbag_enabled: channel.flipit_moonbag_enabled !== false,
      flipit_moonbag_sell_pct: channel.flipit_moonbag_sell_pct || 90,
      flipit_moonbag_keep_pct: channel.flipit_moonbag_keep_pct || 10,
      scalp_test_mode: channel.scalp_test_mode !== false,
      scalp_buy_amount_sol: channel.scalp_buy_amount_sol ?? (channel.scalp_buy_amount_usd ? channel.scalp_buy_amount_usd / solPrice : 0.05),
      scalp_buy_amount_usd: channel.scalp_buy_amount_usd,
      scalp_min_bonding_pct: channel.scalp_min_bonding_pct ?? 2,
      scalp_max_bonding_pct: channel.scalp_max_bonding_pct ?? 50,
      scalp_max_age_minutes: channel.scalp_max_age_minutes ?? 10,
      scalp_min_callers: channel.scalp_min_callers ?? 2,
      scalp_caller_timeout_seconds: channel.scalp_caller_timeout_seconds ?? 60,
      scalp_take_profit_pct: channel.scalp_take_profit_pct ?? 100,
      scalp_moon_bag_pct: channel.scalp_moon_bag_pct ?? 10,
      scalp_stop_loss_pct: channel.scalp_stop_loss_pct ?? 25,
      scalp_buy_slippage_bps: channel.scalp_buy_slippage_bps ?? 1000,
      scalp_sell_slippage_bps: channel.scalp_sell_slippage_bps ?? 2500,
      scalp_buy_priority_fee: channel.scalp_buy_priority_fee ?? 'high',
      scalp_sell_priority_fee: channel.scalp_sell_priority_fee ?? 'veryHigh',
      kingkong_trigger_source: channel.kingkong_trigger_source || 'whale_name',
      kingkong_quick_amount_usd: channel.kingkong_quick_amount_usd ?? 25,
      kingkong_quick_multiplier: channel.kingkong_quick_multiplier ?? 2,
      kingkong_diamond_amount_usd: channel.kingkong_diamond_amount_usd ?? 100,
      kingkong_diamond_trailing_stop_pct: channel.kingkong_diamond_trailing_stop_pct ?? 25,
      kingkong_diamond_min_peak_x: channel.kingkong_diamond_min_peak_x ?? 5,
      kingkong_diamond_max_hold_hours: channel.kingkong_diamond_max_hold_hours ?? 24,
      kingkong_diamond_stop_urgency: channel.kingkong_diamond_stop_urgency || 'normal',
    });
    setHasChanges(false);
  }, [channel.id, solPrice]);

  const updateLocal = (field: string, value: any) => {
    setLocalConfig(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      // Build update object based on section
      let updateData: Record<string, any> = {};
      
      if (section === 'flipit') {
        updateData = {
          flipit_wallet_id: localConfig.flipit_wallet_id,
          flipit_buy_amount_sol: localConfig.flipit_buy_amount_sol,
          flipit_buy_amount_usd: localConfig.flipit_buy_amount_sol * solPrice,
          flipit_sell_multiplier: localConfig.flipit_sell_multiplier,
          flipit_max_daily_positions: localConfig.flipit_max_daily_positions,
          flipit_moonbag_enabled: localConfig.flipit_moonbag_enabled,
          flipit_moonbag_sell_pct: localConfig.flipit_moonbag_sell_pct,
          flipit_moonbag_keep_pct: localConfig.flipit_moonbag_keep_pct,
        };
      } else if (section === 'scalp') {
        updateData = {
          flipit_wallet_id: localConfig.flipit_wallet_id,
          scalp_test_mode: localConfig.scalp_test_mode,
          scalp_buy_amount_sol: localConfig.scalp_buy_amount_sol,
          scalp_buy_amount_usd: localConfig.scalp_buy_amount_sol * solPrice,
          scalp_min_bonding_pct: localConfig.scalp_min_bonding_pct,
          scalp_max_bonding_pct: localConfig.scalp_max_bonding_pct,
          scalp_max_age_minutes: localConfig.scalp_max_age_minutes,
          scalp_min_callers: localConfig.scalp_min_callers,
          scalp_caller_timeout_seconds: localConfig.scalp_caller_timeout_seconds,
          scalp_take_profit_pct: localConfig.scalp_take_profit_pct,
          scalp_moon_bag_pct: localConfig.scalp_moon_bag_pct,
          scalp_stop_loss_pct: localConfig.scalp_stop_loss_pct,
          scalp_buy_slippage_bps: localConfig.scalp_buy_slippage_bps,
          scalp_sell_slippage_bps: localConfig.scalp_sell_slippage_bps,
          scalp_buy_priority_fee: localConfig.scalp_buy_priority_fee,
          scalp_sell_priority_fee: localConfig.scalp_sell_priority_fee,
        };
      } else if (section === 'kingkong') {
        updateData = {
          flipit_wallet_id: localConfig.flipit_wallet_id,
          kingkong_trigger_source: localConfig.kingkong_trigger_source,
          kingkong_quick_amount_usd: localConfig.kingkong_quick_amount_usd,
          kingkong_quick_multiplier: localConfig.kingkong_quick_multiplier,
          kingkong_diamond_amount_usd: localConfig.kingkong_diamond_amount_usd,
          kingkong_diamond_trailing_stop_pct: localConfig.kingkong_diamond_trailing_stop_pct,
          kingkong_diamond_min_peak_x: localConfig.kingkong_diamond_min_peak_x,
          kingkong_diamond_max_hold_hours: localConfig.kingkong_diamond_max_hold_hours,
          kingkong_diamond_stop_urgency: localConfig.kingkong_diamond_stop_urgency,
        };
      }

      const { error } = await supabase
        .from('telegram_channel_config')
        .update(updateData)
        .eq('id', channel.id);

      if (error) throw error;

      toast.success('Settings saved');
      setHasChanges(false);
      onSaved();
    } catch (err) {
      console.error('Error saving config:', err);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  // FlipIt Section
  if (section === 'flipit') {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          When rules match, automatically create a FlipIt position + fantasy tracking.
        </p>
        
        {/* Wallet Selector */}
        <div className="mb-3">
          <Label className="text-xs text-muted-foreground">Trading Wallet</Label>
          <Select
            value={localConfig.flipit_wallet_id || ''}
            onValueChange={(value) => updateLocal('flipit_wallet_id', value || null)}
          >
            <SelectTrigger className={`h-8 text-sm ${!localConfig.flipit_wallet_id ? 'border-orange-500/50 bg-orange-500/10' : ''}`}>
              <SelectValue placeholder="Select wallet..." />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border">
              {flipitWallets.length === 0 ? (
                <div className="py-2 px-3 text-sm text-muted-foreground">No FlipIt wallets available</div>
              ) : (
                flipitWallets.map((wallet) => (
                  <SelectItem key={wallet.id} value={wallet.id}>
                    {wallet.label} ({wallet.pubkey.slice(0, 4)}...{wallet.pubkey.slice(-4)})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          {!localConfig.flipit_wallet_id && (
            <p className="text-xs text-orange-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              No wallet assigned - auto-buys won't execute
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Buy (SOL)</Label>
            <Input
              type="number"
              step="0.01"
              value={localConfig.flipit_buy_amount_sol}
              onChange={(e) => updateLocal('flipit_buy_amount_sol', Number(e.target.value))}
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground mt-1">
              ≈ ${(localConfig.flipit_buy_amount_sol * solPrice).toFixed(2)} USD
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Target (X)</Label>
            <Input
              type="number"
              step="0.1"
              value={localConfig.flipit_sell_multiplier}
              onChange={(e) => updateLocal('flipit_sell_multiplier', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Max/Day</Label>
            <Input
              type="number"
              value={localConfig.flipit_max_daily_positions}
              onChange={(e) => updateLocal('flipit_max_daily_positions', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Moonbag Settings */}
        <div className={`p-2 rounded border ${
          localConfig.flipit_moonbag_enabled 
            ? 'bg-emerald-500/10 border-emerald-500/30' 
            : 'bg-muted/30 border-border/50'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">🌙</span>
              <span className="text-sm font-medium">Moonbag</span>
              {localConfig.flipit_moonbag_enabled && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                  Active
                </Badge>
              )}
            </div>
            <Switch
              checked={localConfig.flipit_moonbag_enabled}
              onCheckedChange={(checked) => updateLocal('flipit_moonbag_enabled', checked)}
            />
          </div>
          {localConfig.flipit_moonbag_enabled && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                At {localConfig.flipit_sell_multiplier}x: Sell {localConfig.flipit_moonbag_sell_pct}%, keep {localConfig.flipit_moonbag_keep_pct}% moonbag
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Sell %</Label>
                  <Input
                    type="number"
                    step="5"
                    min="50"
                    max="99"
                    value={localConfig.flipit_moonbag_sell_pct}
                    onChange={(e) => {
                      const sellPct = Math.min(99, Math.max(50, Number(e.target.value)));
                      updateLocal('flipit_moonbag_sell_pct', sellPct);
                      updateLocal('flipit_moonbag_keep_pct', 100 - sellPct);
                    }}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Keep %</Label>
                  <Input
                    type="number"
                    disabled
                    value={localConfig.flipit_moonbag_keep_pct}
                    className="h-8 text-sm bg-muted/50"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Save Button */}
        <Button 
          onClick={saveChanges} 
          disabled={!hasChanges || saving}
          className={`w-full ${hasChanges ? 'bg-green-600 hover:bg-green-700' : ''}`}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {hasChanges ? 'Save Changes' : 'No Changes'}
        </Button>
      </div>
    );
  }

  // Scalp Section
  if (section === 'scalp') {
    return (
      <div className="space-y-3">
        {/* Test Mode Toggle */}
        <div className={`flex items-center justify-between p-2 rounded border ${
          localConfig.scalp_test_mode 
            ? 'bg-purple-500/10 border-purple-500/30' 
            : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center gap-2">
            <FlaskConical className={`h-4 w-4 ${localConfig.scalp_test_mode ? 'text-purple-500' : 'text-red-500'}`} />
            <div>
              <span className="text-sm font-medium">Test Mode</span>
              <p className="text-xs text-muted-foreground">
                {localConfig.scalp_test_mode 
                  ? 'Simulate trades without real transactions' 
                  : '⚠️ LIVE MODE - Real SOL will be spent!'}
              </p>
            </div>
          </div>
          <Switch 
            checked={localConfig.scalp_test_mode}
            onCheckedChange={(checked) => updateLocal('scalp_test_mode', checked)}
          />
        </div>

        {/* Trading Wallet */}
        <div>
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Wallet className="h-3 w-3" /> Trading Wallet
          </Label>
          <Select
            value={localConfig.flipit_wallet_id || ''}
            onValueChange={(value) => updateLocal('flipit_wallet_id', value || null)}
          >
            <SelectTrigger className={`h-8 text-sm ${!localConfig.flipit_wallet_id ? 'border-orange-500/50 bg-orange-500/10' : ''}`}>
              <SelectValue placeholder="Select wallet..." />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border">
              {flipitWallets.map((wallet) => (
                <SelectItem key={wallet.id} value={wallet.id}>
                  {wallet.label} ({wallet.pubkey.slice(0, 4)}...{wallet.pubkey.slice(-4)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Buy Amount + Bonding */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Buy (SOL)</Label>
            <Input
              type="number"
              step="0.01"
              value={localConfig.scalp_buy_amount_sol}
              onChange={(e) => updateLocal('scalp_buy_amount_sol', Number(e.target.value))}
              className="h-8 text-sm"
            />
            <p className="text-xs text-muted-foreground">≈ ${(localConfig.scalp_buy_amount_sol * solPrice).toFixed(2)}</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Bonding Min %</Label>
            <Input
              type="number"
              value={localConfig.scalp_min_bonding_pct}
              onChange={(e) => updateLocal('scalp_min_bonding_pct', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Bonding Max %</Label>
            <Input
              type="number"
              value={localConfig.scalp_max_bonding_pct}
              onChange={(e) => updateLocal('scalp_max_bonding_pct', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Caller Settings */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Min Callers</Label>
            <Input
              type="number"
              value={localConfig.scalp_min_callers}
              onChange={(e) => updateLocal('scalp_min_callers', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Timeout (s)</Label>
            <Input
              type="number"
              value={localConfig.scalp_caller_timeout_seconds}
              onChange={(e) => updateLocal('scalp_caller_timeout_seconds', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Max Age (min)</Label>
            <Input
              type="number"
              value={localConfig.scalp_max_age_minutes}
              onChange={(e) => updateLocal('scalp_max_age_minutes', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Profit/Loss Settings */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">Take Profit %</Label>
            <Input
              type="number"
              value={localConfig.scalp_take_profit_pct}
              onChange={(e) => updateLocal('scalp_take_profit_pct', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Moonbag %</Label>
            <Input
              type="number"
              value={localConfig.scalp_moon_bag_pct}
              onChange={(e) => updateLocal('scalp_moon_bag_pct', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Stop Loss %</Label>
            <Input
              type="number"
              value={localConfig.scalp_stop_loss_pct}
              onChange={(e) => updateLocal('scalp_stop_loss_pct', Number(e.target.value))}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Save Button */}
        <Button 
          onClick={saveChanges} 
          disabled={!hasChanges || saving}
          className={`w-full ${hasChanges ? 'bg-green-600 hover:bg-green-700' : ''}`}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {hasChanges ? 'Save Changes' : 'No Changes'}
        </Button>
      </div>
    );
  }

  // KingKong Section
  if (section === 'kingkong') {
    return (
      <div className="space-y-3">
        {/* Wallet */}
        <div>
          <Label className="text-xs text-muted-foreground">Trading Wallet</Label>
          <Select
            value={localConfig.flipit_wallet_id || ''}
            onValueChange={(value) => updateLocal('flipit_wallet_id', value || null)}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select wallet..." />
            </SelectTrigger>
            <SelectContent className="bg-popover border border-border">
              {flipitWallets.map((wallet) => (
                <SelectItem key={wallet.id} value={wallet.id}>
                  {wallet.label} ({wallet.pubkey.slice(0, 4)}...{wallet.pubkey.slice(-4)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quick Flip */}
        <div className="p-2 rounded border bg-blue-500/10 border-blue-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-medium">Quick Flip</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Amount ($)</Label>
              <Input
                type="number"
                value={localConfig.kingkong_quick_amount_usd}
                onChange={(e) => updateLocal('kingkong_quick_amount_usd', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Target (X)</Label>
              <Input
                type="number"
                step="0.5"
                value={localConfig.kingkong_quick_multiplier}
                onChange={(e) => updateLocal('kingkong_quick_multiplier', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Diamond Hand */}
        <div className="p-2 rounded border bg-purple-500/10 border-purple-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Crown className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium">Diamond Hand</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Amount ($)</Label>
              <Input
                type="number"
                value={localConfig.kingkong_diamond_amount_usd}
                onChange={(e) => updateLocal('kingkong_diamond_amount_usd', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Trailing Stop %</Label>
              <Input
                type="number"
                value={localConfig.kingkong_diamond_trailing_stop_pct}
                onChange={(e) => updateLocal('kingkong_diamond_trailing_stop_pct', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div>
              <Label className="text-xs text-muted-foreground">Min Peak (X)</Label>
              <Input
                type="number"
                step="0.5"
                value={localConfig.kingkong_diamond_min_peak_x}
                onChange={(e) => updateLocal('kingkong_diamond_min_peak_x', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Max Hold (hrs)</Label>
              <Input
                type="number"
                value={localConfig.kingkong_diamond_max_hold_hours}
                onChange={(e) => updateLocal('kingkong_diamond_max_hold_hours', Number(e.target.value))}
                className="h-8 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <Button 
          onClick={saveChanges} 
          disabled={!hasChanges || saving}
          className={`w-full ${hasChanges ? 'bg-green-600 hover:bg-green-700' : ''}`}
        >
          {saving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {hasChanges ? 'Save Changes' : 'No Changes'}
        </Button>
      </div>
    );
  }

  return null;
}
