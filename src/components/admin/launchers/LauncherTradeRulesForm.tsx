import { useEffect, useState } from "react";
import { useLauncherTradeRule, useUpdateTradeRule, useBlackboxWallets, type LauncherTradeRule } from "@/hooks/useLauncherProfiles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

export function LauncherTradeRulesForm({ profileId }: { profileId: string }) {
  const { data: rule, isLoading } = useLauncherTradeRule(profileId);
  const { data: wallets } = useBlackboxWallets();
  const update = useUpdateTradeRule();
  const [form, setForm] = useState<Partial<LauncherTradeRule>>({});

  useEffect(() => { if (rule) setForm(rule); }, [rule]);

  function patch<K extends keyof LauncherTradeRule>(k: K, v: LauncherTradeRule[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    try {
      await update.mutateAsync({ ...form, launcher_profile_id: profileId } as any);
      toast({ title: "Rules saved" });
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    }
  }

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading rules…</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Trade Rules</CardTitle>
        <div className="flex items-center gap-2">
          <Label htmlFor="enabled" className="text-xs">Enabled</Label>
          <Switch id="enabled" checked={!!form.enabled} onCheckedChange={(v) => patch("enabled", v)} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <Field label="Buy Amount (SOL)" value={form.buy_amount_sol ?? 0.01} onChange={(v) => patch("buy_amount_sol", v)} step="0.001" />
        <Field label="Slippage (bps)" value={form.slippage_bps ?? 1500} onChange={(v) => patch("slippage_bps", v)} />
        <Field label="Priority Fee (lamports)" value={form.priority_fee_lamports ?? 100000} onChange={(v) => patch("priority_fee_lamports", v)} />
        <Field label="Jito Tip (lamports)" value={form.jito_tip_lamports ?? 100000} onChange={(v) => patch("jito_tip_lamports", v)} />
        <Field label="Target Factor (× entry)" value={form.target_factor ?? 2} onChange={(v) => patch("target_factor", v)} step="0.1" />
        <Field label="Min Seconds After Mint" value={form.min_seconds_after_mint ?? 4} onChange={(v) => patch("min_seconds_after_mint", v)} />
        <Field label="Min Dev Buy (SOL)" value={form.require_dev_buy_min_sol ?? 0} onChange={(v) => patch("require_dev_buy_min_sol", v)} step="0.1" />
        <Field label="Max Daily Spend (SOL)" value={form.max_daily_spend_sol ?? 1} onChange={(v) => patch("max_daily_spend_sol", v)} step="0.1" />
        <Field label="Max Hold (seconds)" value={form.max_hold_seconds ?? 3600} onChange={(v) => patch("max_hold_seconds", v)} />
        <div className="col-span-2">
          <Label>Funding Wallet (flipit)</Label>
          <Select value={form.funding_wallet_id ?? ""} onValueChange={(v) => patch("funding_wallet_id", v as any)}>
            <SelectTrigger><SelectValue placeholder="Select wallet" /></SelectTrigger>
            <SelectContent>
              {(() => {
                const FLIPIT = "FRtWhqNbTjRVm71pCpQaM45f39zRq9C9k9AUqj1hAnG5";
                const list = (wallets || []) as any[];
                const flipit = list.find((w) => w.pubkey === FLIPIT);
                const rest = list.filter((w) => w.pubkey !== FLIPIT);
                const ordered = flipit ? [flipit, ...rest] : rest;
                return ordered.map((w: any) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.pubkey === FLIPIT ? "flipit" : (w.nickname || w.pubkey.slice(0, 8))} — {Number(w.sol_balance || 0).toFixed(3)} SOL
                  </SelectItem>
                ));
              })()}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex justify-end">
          <Button onClick={save} disabled={update.isPending}>{update.isPending ? "Saving…" : "Save Rules"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}