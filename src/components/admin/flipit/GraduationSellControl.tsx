import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { GraduationCap, Activity, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface GraduationSellSettings {
  graduation_sell_enabled?: boolean | null;
  graduation_sell_trigger_pct?: number | null;
  graduation_sell_max_capture_pct?: number | null;
  graduation_sell_min_capture_pct?: number | null;
  graduation_sell_trail_drop_pct?: number | null;
  graduation_sell_slippage_bps?: number | null;
  graduation_sell_status?: string | null;
  graduation_sell_armed_at?: string | null;
  graduation_sell_arming_price_usd?: number | null;
  graduation_sell_peak_price_usd?: number | null;
  graduation_sell_executed_at?: string | null;
  bonding_curve_progress?: number | null;
}

interface Props {
  positionId: string;
  position: GraduationSellSettings;
  currentPrice?: number;
  onSaved?: () => void;
}

const DEFAULTS = {
  trigger: 99.9,
  maxCapture: 400,
  minCapture: 0,
  trailDrop: 15,
  slippage: 2500,
};

function statusBadge(status?: string | null) {
  switch (status) {
    case 'armed_pre_grad':
      return <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-amber-500/20 text-amber-300 border-amber-500/40"><Activity className="h-2 w-2 mr-0.5" />ARMED</Badge>;
    case 'watching_post_grad':
      return <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-emerald-500/20 text-emerald-300 border-emerald-500/40"><Activity className="h-2 w-2 mr-0.5 animate-pulse" />WATCHING</Badge>;
    case 'executed':
      return <Badge variant="secondary" className="text-[9px] px-1 py-0 bg-primary/20 text-primary border-primary/40"><CheckCircle2 className="h-2 w-2 mr-0.5" />EXECUTED</Badge>;
    case 'failed':
      return <Badge variant="destructive" className="text-[9px] px-1 py-0"><AlertTriangle className="h-2 w-2 mr-0.5" />FAILED</Badge>;
    default:
      return null;
  }
}

export const GraduationSellControl: React.FC<Props> = ({ positionId, position, currentPrice, onSaved }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(!!position.graduation_sell_enabled);
  const [trigger, setTrigger] = useState<string>(String(position.graduation_sell_trigger_pct ?? DEFAULTS.trigger));
  const [maxCap, setMaxCap] = useState<string>(String(position.graduation_sell_max_capture_pct ?? DEFAULTS.maxCapture));
  const [minCap, setMinCap] = useState<string>(String(position.graduation_sell_min_capture_pct ?? DEFAULTS.minCapture));
  const [trailDrop, setTrailDrop] = useState<string>(String(position.graduation_sell_trail_drop_pct ?? DEFAULTS.trailDrop));
  const [slippage, setSlippage] = useState<string>(String(position.graduation_sell_slippage_bps ?? DEFAULTS.slippage));

  const status = position.graduation_sell_status ?? 'disabled';
  const isActive = !!position.graduation_sell_enabled && status !== 'disabled' && status !== 'executed' && status !== 'failed';
  const arming = position.graduation_sell_arming_price_usd;
  const peak = position.graduation_sell_peak_price_usd;
  const captureX = arming && currentPrice ? currentPrice / arming : null;

  const save = async () => {
    const tNum = parseFloat(trigger);
    const mxNum = parseFloat(maxCap);
    const mnNum = parseFloat(minCap);
    const tdNum = parseFloat(trailDrop);
    const slNum = parseInt(slippage, 10);

    if (enabled) {
      if (!Number.isFinite(tNum) || tNum < 90 || tNum > 100) return toast.error('Trigger % must be 90–100');
      if (!Number.isFinite(mxNum) || mxNum < 50) return toast.error('Max capture % must be ≥ 50');
      if (!Number.isFinite(mnNum) || mnNum < 0 || mnNum > 100) return toast.error('Min capture floor must be 0–100');
      if (!Number.isFinite(tdNum) || tdNum < 1 || tdNum > 90) return toast.error('Trail drop % must be 1–90');
      if (!Number.isFinite(slNum) || slNum < 100 || slNum > 9000) return toast.error('Slippage must be 100–9000 bps');
    }

    setSaving(true);
    try {
      const patch: Record<string, unknown> = {
        graduation_sell_enabled: enabled,
        graduation_sell_trigger_pct: tNum,
        graduation_sell_max_capture_pct: mxNum,
        graduation_sell_min_capture_pct: mnNum,
        graduation_sell_trail_drop_pct: tdNum,
        graduation_sell_slippage_bps: slNum,
      };
      if (!enabled) {
        patch.graduation_sell_status = 'disabled';
        patch.graduation_sell_armed_at = null;
        patch.graduation_sell_arming_price_usd = null;
        patch.graduation_sell_peak_price_usd = null;
      } else if (status === 'disabled') {
        patch.graduation_sell_status = 'disabled';
      }

      const { error } = await supabase
        .from('flip_positions')
        .update(patch)
        .eq('id', positionId);
      if (error) throw error;
      toast.success(enabled ? '🎓 Graduation Sell armed' : 'Graduation Sell disabled');
      setOpen(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message || 'Failed to save graduation sell');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant={isActive ? 'default' : 'outline'}
            className={`h-6 px-1.5 text-[10px] gap-1 ${isActive ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40' : ''}`}
            title="Graduation Sell — capture the Raydium graduation candle"
          >
            <GraduationCap className="h-3 w-3" />
            GRAD
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 space-y-2.5" align="end">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <GraduationCap className="h-4 w-4" />
                Graduation Sell
              </div>
              <div className="text-[10px] text-muted-foreground">Catch the Raydium spike at curve completion.</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {(isActive || status === 'executed') && (
            <div className="rounded border border-border bg-muted/30 p-2 text-[10px] space-y-0.5 font-mono">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span>{statusBadge(status)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">BC progress:</span>
                <span>{position.bonding_curve_progress != null ? `${position.bonding_curve_progress.toFixed(2)}%` : '—'}</span>
              </div>
              {arming != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Armed @:</span>
                  <span>${arming.toFixed(10).replace(/\.?0+$/, '')}</span>
                </div>
              )}
              {peak != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Peak:</span>
                  <span>${peak.toFixed(10).replace(/\.?0+$/, '')}</span>
                </div>
              )}
              {captureX != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Capture:</span>
                  <span className={captureX >= 1 ? 'text-emerald-400' : 'text-amber-400'}>
                    {captureX.toFixed(2)}x
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Trigger %</Label>
              <Input className="h-7 text-xs" type="number" step="0.1" value={trigger} onChange={e => setTrigger(e.target.value)} disabled={!enabled} />
              <div className="text-[9px] text-muted-foreground mt-0.5">Arm at this curve %</div>
            </div>
            <div>
              <Label className="text-[10px]">Max capture %</Label>
              <Input className="h-7 text-xs" type="number" value={maxCap} onChange={e => setMaxCap(e.target.value)} disabled={!enabled} />
              <div className="text-[9px] text-muted-foreground mt-0.5">Hard cap above arming</div>
            </div>
            <div>
              <Label className="text-[10px]">Trail drop %</Label>
              <Input className="h-7 text-xs" type="number" value={trailDrop} onChange={e => setTrailDrop(e.target.value)} disabled={!enabled} />
              <div className="text-[9px] text-muted-foreground mt-0.5">Sell on % drop from peak</div>
            </div>
            <div>
              <Label className="text-[10px]">Min floor %</Label>
              <Input className="h-7 text-xs" type="number" value={minCap} onChange={e => setMinCap(e.target.value)} disabled={!enabled} />
              <div className="text-[9px] text-muted-foreground mt-0.5">Dump-protection floor</div>
            </div>
            <div className="col-span-2">
              <Label className="text-[10px]">Slippage (bps) — graduation candles need wide tolerance</Label>
              <Input className="h-7 text-xs" type="number" value={slippage} onChange={e => setSlippage(e.target.value)} disabled={!enabled} />
              <div className="text-[9px] text-muted-foreground mt-0.5">2500 = 25%</div>
            </div>
          </div>

          <Button onClick={save} disabled={saving} className="w-full h-8" size="sm">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </PopoverContent>
      </Popover>
      {statusBadge(status)}
    </div>
  );
};
