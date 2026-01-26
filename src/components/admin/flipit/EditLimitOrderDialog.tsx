import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, Zap, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LimitOrder {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
  buy_price_min_usd: number;
  buy_price_max_usd: number;
  buy_amount_sol: number;
  target_multiplier: number;
  slippage_bps: number;
  priority_fee_mode: string;
  status: string;
  expires_at: string;
  monitoring_mode?: string;
  volume_trigger_delta?: number | null;
  volume_direction?: string | null;
}

interface EditLimitOrderDialogProps {
  order: LimitOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  solPrice: number | null;
}

const SLIPPAGE_OPTIONS = [
  { value: 500, label: '5%' },
  { value: 1000, label: '10%' },
  { value: 1500, label: '15%' },
  { value: 2000, label: '20%' },
  { value: 2500, label: '25%' },
  { value: 5000, label: '50%' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', icon: '🐢' },
  { value: 'medium', label: 'Medium', icon: '⚡' },
  { value: 'high', label: 'High', icon: '🚀' },
  { value: 'turbo', label: 'Turbo', icon: '💨' },
];

export function EditLimitOrderDialog({ order, open, onOpenChange, onUpdated, solPrice }: EditLimitOrderDialogProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Form state
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [amountSol, setAmountSol] = useState('');
  const [targetMultiplier, setTargetMultiplier] = useState('');
  const [slippageBps, setSlippageBps] = useState('1000');
  const [priorityFeeMode, setPriorityFeeMode] = useState('medium');
  const [expiresAt, setExpiresAt] = useState('');
  const [monitoringMode, setMonitoringMode] = useState<'tight' | 'deep'>('tight');
  const [volumeTriggerDelta, setVolumeTriggerDelta] = useState('');
  const [volumeDirection, setVolumeDirection] = useState<'rise' | 'dump'>('rise');

  // Populate form when order changes
  useEffect(() => {
    if (order) {
      setPriceMin(order.buy_price_min_usd.toString());
      setPriceMax(order.buy_price_max_usd.toString());
      setAmountSol(order.buy_amount_sol.toString());
      setTargetMultiplier(order.target_multiplier.toString());
      setSlippageBps(order.slippage_bps.toString());
      setPriorityFeeMode(order.priority_fee_mode || 'medium');
      // Format expires_at for datetime-local input
      const expiresDate = new Date(order.expires_at);
      setExpiresAt(expiresDate.toISOString().slice(0, 16));
      setMonitoringMode((order.monitoring_mode as 'tight' | 'deep') || 'tight');
      setVolumeTriggerDelta(order.volume_trigger_delta?.toString() || '50');
      setVolumeDirection((order.volume_direction as 'rise' | 'dump') || 'rise');
    }
  }, [order]);

  const handleSave = async () => {
    if (!order) return;
    
    setIsUpdating(true);
    try {
      const updates: Record<string, unknown> = {
        buy_price_min_usd: parseFloat(priceMin),
        buy_price_max_usd: parseFloat(priceMax),
        buy_amount_sol: parseFloat(amountSol),
        target_multiplier: parseFloat(targetMultiplier),
        slippage_bps: parseInt(slippageBps),
        priority_fee_mode: priorityFeeMode,
        expires_at: new Date(expiresAt).toISOString(),
        monitoring_mode: monitoringMode,
        updated_at: new Date().toISOString(),
      };

      // Add volume fields only for deep mode
      if (monitoringMode === 'deep') {
        updates.volume_trigger_delta = parseFloat(volumeTriggerDelta);
        updates.volume_direction = volumeDirection;
      } else {
        updates.volume_trigger_delta = null;
        updates.volume_direction = null;
      }

      const { error } = await supabase
        .from('flip_limit_orders')
        .update(updates)
        .eq('id', order.id);

      if (error) throw error;

      toast.success('Limit order updated successfully');
      onUpdated();
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update order';
      toast.error(message);
    } finally {
      setIsUpdating(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg bg-background border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit Limit Order
            <Badge variant="outline">{order.token_symbol || 'TOKEN'}</Badge>
          </DialogTitle>
          <DialogDescription>
            Update the parameters for this limit order. Changes will take effect immediately.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Monitoring Mode Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <Label className="font-medium">Monitoring Mode</Label>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${monitoringMode === 'tight' ? 'text-green-500' : 'text-muted-foreground'}`}>
                Tight
              </span>
              <Switch
                checked={monitoringMode === 'deep'}
                onCheckedChange={(checked) => setMonitoringMode(checked ? 'deep' : 'tight')}
              />
              <span className={`text-sm font-medium ${monitoringMode === 'deep' ? 'text-blue-500' : 'text-muted-foreground'}`}>
                Deep
              </span>
            </div>
          </div>

          {/* Mode Description */}
          <div className={`text-xs p-2 rounded ${monitoringMode === 'tight' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'}`}>
            {monitoringMode === 'tight' ? (
              <div className="flex items-center gap-1">
                <Zap className="h-3 w-3" />
                <span>Fast 2-second price checks when price enters your range</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Hourly volume-based checks - triggers on volume surge/dump</span>
              </div>
            )}
          </div>

          {/* Price Range (for Tight mode) */}
          {monitoringMode === 'tight' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="priceMin">Min Price (USD)</Label>
                <Input
                  id="priceMin"
                  type="number"
                  step="0.0000000001"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  placeholder="0.00000001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priceMax">Max Price (USD)</Label>
                <Input
                  id="priceMax"
                  type="number"
                  step="0.0000000001"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  placeholder="0.0000001"
                />
              </div>
            </div>
          )}

          {/* Volume Trigger (for Deep mode) */}
          {monitoringMode === 'deep' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="volumeDelta">Volume Delta (%)</Label>
                <Input
                  id="volumeDelta"
                  type="number"
                  step="1"
                  value={volumeTriggerDelta}
                  onChange={(e) => setVolumeTriggerDelta(e.target.value)}
                  placeholder="50"
                />
                <p className="text-xs text-muted-foreground">
                  Trigger when volume changes by this %
                </p>
              </div>
              <div className="space-y-2">
                <Label>Direction</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={volumeDirection === 'rise' ? 'default' : 'outline'}
                    onClick={() => setVolumeDirection('rise')}
                    className={volumeDirection === 'rise' ? 'bg-green-500 hover:bg-green-600' : ''}
                  >
                    <TrendingUp className="h-4 w-4 mr-1" />
                    Rise
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={volumeDirection === 'dump' ? 'default' : 'outline'}
                    onClick={() => setVolumeDirection('dump')}
                    className={volumeDirection === 'dump' ? 'bg-red-500 hover:bg-red-600' : ''}
                  >
                    <TrendingDown className="h-4 w-4 mr-1" />
                    Dump
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amountSol">Amount (SOL)</Label>
            <Input
              id="amountSol"
              type="number"
              step="0.01"
              value={amountSol}
              onChange={(e) => setAmountSol(e.target.value)}
              placeholder="0.1"
            />
            {solPrice && amountSol && (
              <p className="text-xs text-muted-foreground">
                ≈ ${(parseFloat(amountSol) * solPrice).toFixed(2)} USD
              </p>
            )}
          </div>

          {/* Target Multiplier */}
          <div className="space-y-2">
            <Label htmlFor="targetMultiplier">Target Multiplier</Label>
            <div className="flex items-center gap-2">
              <Input
                id="targetMultiplier"
                type="number"
                step="0.1"
                min="1.1"
                value={targetMultiplier}
                onChange={(e) => setTargetMultiplier(e.target.value)}
                placeholder="2"
              />
              <Badge variant="outline" className="text-primary">
                {targetMultiplier}x
              </Badge>
            </div>
          </div>

          {/* Expires At */}
          <div className="space-y-2">
            <Label htmlFor="expiresAt">Expires At</Label>
            <Input
              id="expiresAt"
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          {/* Slippage & Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Slippage</Label>
              <Select value={slippageBps} onValueChange={setSlippageBps}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {SLIPPAGE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value.toString()}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority Fee</Label>
              <Select value={priorityFeeMode} onValueChange={setPriorityFeeMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  {PRIORITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.icon} {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUpdating}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isUpdating}>
            {isUpdating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
