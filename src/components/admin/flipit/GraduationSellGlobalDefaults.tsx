import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GraduationCap, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Defaults {
  feeMode: string;
  feeMicro: number | null;
  jitoTipSol: string;
  moonbagPct: string;
}

const HARD_DEFAULTS: Defaults = {
  feeMode: 'turbo',
  feeMicro: null,
  jitoTipSol: '0.001000',
  moonbagPct: '0',
};

export const GraduationSellGlobalDefaults: React.FC = () => {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feeMode, setFeeMode] = useState<string>(HARD_DEFAULTS.feeMode);
  const [feeMicro, setFeeMicro] = useState<string>('');
  const [jitoTipSol, setJitoTipSol] = useState<string>(HARD_DEFAULTS.jitoTipSol);
  const [moonbagPct, setMoonbagPct] = useState<string>(HARD_DEFAULTS.moonbagPct);
  const [settingsId, setSettingsId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('flipit_settings')
        .select(
          'id, graduation_sell_priority_fee_mode_default, graduation_sell_priority_fee_micro_lamports_default, graduation_sell_jito_tip_lamports_default, graduation_sell_moonbag_pct_default'
        )
        .maybeSingle();
      if (error) {
        toast.error('Failed to load Flipit settings: ' + error.message);
        setLoaded(true);
        return;
      }
      if (data) {
        setSettingsId(data.id);
        setFeeMode((data.graduation_sell_priority_fee_mode_default as any) ?? HARD_DEFAULTS.feeMode);
        setFeeMicro(
          data.graduation_sell_priority_fee_micro_lamports_default != null
            ? String(data.graduation_sell_priority_fee_micro_lamports_default)
            : ''
        );
        setJitoTipSol(
          data.graduation_sell_jito_tip_lamports_default != null
            ? (data.graduation_sell_jito_tip_lamports_default / 1e9).toFixed(6)
            : HARD_DEFAULTS.jitoTipSol
        );
        setMoonbagPct(
          data.graduation_sell_moonbag_pct_default != null
            ? String(data.graduation_sell_moonbag_pct_default)
            : HARD_DEFAULTS.moonbagPct
        );
      }
      setLoaded(true);
    })();
  }, []);

  const save = async () => {
    let microVal: number | null = null;
    if (feeMicro.trim() !== '') {
      const n = parseInt(feeMicro, 10);
      if (!Number.isFinite(n) || n < 5_000 || n > 2_000_000) {
        return toast.error('Priority fee µLamports must be 5,000–2,000,000');
      }
      microVal = n;
    }
    const tipSol = parseFloat(jitoTipSol);
    if (!Number.isFinite(tipSol) || tipSol < 0 || tipSol > 0.05) {
      return toast.error('Jito tip must be 0–0.05 SOL');
    }
    const tipLamports = Math.round(tipSol * 1e9);

    const moonbag = parseFloat(moonbagPct);
    if (!Number.isFinite(moonbag) || moonbag < 0 || moonbag > 50) {
      return toast.error('Moonbag % must be 0–50');
    }

    setSaving(true);
    try {
      if (!settingsId) {
        toast.error('No flipit_settings row found — cannot save defaults.');
        return;
      }
      const { error } = await supabase
        .from('flipit_settings')
        .update({
          graduation_sell_priority_fee_mode_default: feeMode,
          graduation_sell_priority_fee_micro_lamports_default: microVal,
          graduation_sell_jito_tip_lamports_default: tipLamports,
          graduation_sell_moonbag_pct_default: moonbag,
        })
        .eq('id', settingsId);
      if (error) throw error;
      toast.success('🎓 Graduation Sell defaults saved');
    } catch (e: any) {
      toast.error(e.message || 'Failed to save defaults');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-amber-400" />
          <Zap className="h-3.5 w-3.5 text-amber-400" />
          Graduation Sell — Global Defaults
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="text-[11px] text-muted-foreground">
          Applied to every graduation sell unless a position has its own override. Graduation candles are MEV-heavy —
          higher fees = better fill guarantee. Moonbag % keeps a portion of tokens after the sell fires.
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Priority fee preset</Label>
            <Select value={feeMode} onValueChange={setFeeMode}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medium">Medium (~0.0005 SOL)</SelectItem>
                <SelectItem value="high">High (~0.001 SOL)</SelectItem>
                <SelectItem value="turbo">Turbo (~0.0075 SOL)</SelectItem>
                <SelectItem value="ultra">Ultra (~0.009 SOL)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Custom µLamports (opt.)</Label>
            <Input
              className="h-8 text-xs"
              type="number"
              placeholder="overrides preset"
              value={feeMicro}
              onChange={e => setFeeMicro(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Jito tip (SOL)</Label>
            <Input
              className="h-8 text-xs"
              type="number"
              step="0.0001"
              value={jitoTipSol}
              onChange={e => setJitoTipSol(e.target.value)}
            />
          </div>
          <div className="col-span-3">
            <Label className="text-xs">🌙 Moonbag % (default)</Label>
            <Input
              className="h-8 text-xs"
              type="number"
              min="0"
              max="50"
              step="1"
              value={moonbagPct}
              onChange={e => setMoonbagPct(e.target.value)}
            />
            <div className="text-[10px] text-muted-foreground mt-0.5">
              0 = sell 100% on grad. 20 = keep 20% as a moonbag for further upside (position becomes a moonbag).
            </div>
          </div>
        </div>
        <Button onClick={save} disabled={saving} size="sm" className="w-full">
          {saving ? 'Saving…' : 'Save Global Defaults'}
        </Button>
      </CardContent>
    </Card>
  );
};
