import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Radio, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";

interface ChannelRule {
  id: string;
  channel_id: string;
  channel_name: string | null;
  channel_username: string | null;
  is_active: boolean;
  flipit_enabled: boolean;
  flipit_buy_amount_sol: number | null;
  flipit_sell_multiplier: number | null;
  flipit_first_time_only: boolean;
  flipit_wallet_id: string | null;
}

interface Props {
  flipitWalletId: string | null;
}

export function ChannelAutoBuyRules({ flipitWalletId }: Props) {
  const [channels, setChannels] = useState<ChannelRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<ChannelRule>>>({});

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("telegram_channel_config")
      .select(
        "id, channel_id, channel_name, channel_username, is_active, flipit_enabled, flipit_buy_amount_sol, flipit_sell_multiplier, flipit_first_time_only, flipit_wallet_id"
      )
      .eq("is_active", true)
      .order("channel_name", { ascending: true });
    if (error) {
      toast.error(`Failed to load channels: ${error.message}`);
      setLoading(false);
      return;
    }
    setChannels((data || []) as ChannelRule[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const getVal = <K extends keyof ChannelRule>(c: ChannelRule, key: K): ChannelRule[K] => {
    const draft = drafts[c.id];
    if (draft && key in draft) return draft[key] as ChannelRule[K];
    return c[key];
  };

  const setDraft = (id: string, patch: Partial<ChannelRule>) => {
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));
  };

  const save = async (c: ChannelRule) => {
    const draft = drafts[c.id];
    if (!draft) return;
    setSavingId(c.id);
    const update: {
      flipit_enabled?: boolean;
      flipit_buy_amount_sol?: number | null;
      flipit_sell_multiplier?: number | null;
      flipit_first_time_only?: boolean;
      flipit_wallet_id?: string | null;
    } = {};
    if ("flipit_enabled" in draft) update.flipit_enabled = draft.flipit_enabled as boolean;
    if ("flipit_buy_amount_sol" in draft) update.flipit_buy_amount_sol = draft.flipit_buy_amount_sol as number;
    if ("flipit_sell_multiplier" in draft) update.flipit_sell_multiplier = draft.flipit_sell_multiplier as number;
    if ("flipit_first_time_only" in draft) update.flipit_first_time_only = draft.flipit_first_time_only as boolean;
    if (draft.flipit_enabled && flipitWalletId && !c.flipit_wallet_id) {
      update.flipit_wallet_id = flipitWalletId;
    }

    const { error } = await supabase
      .from("telegram_channel_config")
      .update(update)
      .eq("id", c.id);
    setSavingId(null);
    if (error) {
      toast.error(`Save failed: ${error.message}`);
      return;
    }
    toast.success(`Saved rule for ${c.channel_name || c.channel_id}`);
    setDrafts((d) => {
      const next = { ...d };
      delete next[c.id];
      return next;
    });
    load();
  };

  const isInsiders = (c: ChannelRule) => {
    const n = `${c.channel_name || ""} ${c.channel_username || ""}`.toLowerCase();
    return n.includes("insider");
  };

  return (
    <Card className="border-orange-500/40 bg-gradient-to-br from-orange-500/5 to-amber-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Radio className="h-5 w-5 text-orange-500" />
          Channel Auto-Buy Rules
          <Badge variant="outline" className="ml-2 text-[10px]">
            First-time mints only
          </Badge>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Per-channel auto-buy rules. When a channel posts a token mint for the first time, the FlipIt wallet auto-buys
          the configured SOL amount and arms the take-profit multiplier.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading channels…
          </div>
        ) : channels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active channels found.</p>
        ) : (
          <div className="space-y-2">
            {channels.map((c) => {
              const enabled = !!getVal(c, "flipit_enabled");
              const sol = Number(getVal(c, "flipit_buy_amount_sol") ?? 0.1);
              const mult = Number(getVal(c, "flipit_sell_multiplier") ?? 2);
              const firstOnly = getVal(c, "flipit_first_time_only") !== false;
              const dirty = !!drafts[c.id];
              return (
                <div
                  key={c.id}
                  className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${
                    isInsiders(c) ? "border-amber-500/50 bg-amber-500/5" : "border-border bg-background/40"
                  }`}
                >
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {c.channel_name || c.channel_id}
                      </span>
                      {isInsiders(c) && (
                        <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/40 text-[10px]">
                          <Sparkles className="h-3 w-3 mr-1" /> Insiders
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{c.channel_id}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Auto-buy</Label>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => setDraft(c.id, { flipit_enabled: v })}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-muted-foreground">SOL</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="h-8 w-20"
                      value={sol}
                      onChange={(e) => setDraft(c.id, { flipit_buy_amount_sol: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="flex items-center gap-1">
                    <Label className="text-xs text-muted-foreground">TP ×</Label>
                    <Input
                      type="number"
                      step="0.1"
                      min="1.1"
                      className="h-8 w-20"
                      value={mult}
                      onChange={(e) => setDraft(c.id, { flipit_sell_multiplier: parseFloat(e.target.value) || 0 })}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">1st-time only</Label>
                    <Switch
                      checked={firstOnly}
                      onCheckedChange={(v) => setDraft(c.id, { flipit_first_time_only: v })}
                    />
                  </div>

                  <Button
                    size="sm"
                    variant={dirty ? "default" : "outline"}
                    disabled={!dirty || savingId === c.id}
                    onClick={() => save(c)}
                  >
                    {savingId === c.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    <span className="ml-1 text-xs">{dirty ? "Save" : "Saved"}</span>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          Default: <span className="font-semibold">0.10 SOL · 2× TP · first-time only</span>. The Insiders channel is
          highlighted. Wallet used: the active FlipIt wallet selected above.
        </p>
      </CardContent>
    </Card>
  );
}
