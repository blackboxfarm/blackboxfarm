import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Search, ShieldCheck, Plus, ExternalLink, Building2 } from "lucide-react";

const KNOWN_CEXES = [
  "Binance", "Coinbase", "OKX", "Bybit", "Kraken",
  "KuCoin", "Gate.io", "Crypto.com", "HTX (Huobi)",
  "Gemini", "Bitfinex", "MEXC", "Bitget", "Other",
];

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function ManualKycOverride() {
  const { toast } = useToast();
  const [targetWallet, setTargetWallet] = useState("");
  const [kycWallet, setKycWallet] = useState("");
  const [cexName, setCexName] = useState("");
  const [customCex, setCustomCex] = useState("");
  const [cexLabel, setCexLabel] = useState("");

  // Auto-detect CEX on KYC wallet paste
  const lookupMutation = useMutation({
    mutationFn: async (wallet: string) => {
      const { data, error } = await supabase.functions.invoke("manual-kyc-override", {
        body: { action: "lookup", walletAddress: wallet },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      if (data.isKnownCex) {
        setCexName(data.cexName);
        setCexLabel(data.cexLabel || "");
        toast({
          title: "🏦 Known CEX Detected",
          description: `${data.cexName} — ${data.cexLabel || "auto-matched"}`,
        });
      }
    },
  });

  const addKycMutation = useMutation({
    mutationFn: async () => {
      const resolvedCex = cexName === "Other" ? customCex : cexName;
      if (!resolvedCex) throw new Error("CEX name required");
      if (!BASE58_REGEX.test(targetWallet)) throw new Error("Invalid target wallet");
      if (!BASE58_REGEX.test(kycWallet)) throw new Error("Invalid KYC wallet");

      const { data, error } = await supabase.functions.invoke("manual-kyc-override", {
        body: {
          action: "add-kyc",
          targetWallet,
          kycWallet,
          cexName: resolvedCex,
          cexLabel: cexLabel || undefined,
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast({
        title: "✅ KYC Root Set",
        description: `${data.targetWallet?.slice(0, 8)}… → ${data.cexName} (${data.meshLinksWritten} mesh links)`,
      });
      setTargetWallet("");
      setKycWallet("");
      setCexName("");
      setCustomCex("");
      setCexLabel("");
    },
    onError: (err: any) => {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    },
  });

  // Known CEX wallets list
  const { data: cexWallets } = useQuery({
    queryKey: ["known-cex-wallets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("known_cex_wallets" as any)
        .select("*")
        .order("cex_name");
      if (error) throw error;
      return data as any[];
    },
  });

  const handleKycWalletChange = (val: string) => {
    setKycWallet(val);
    if (BASE58_REGEX.test(val)) {
      lookupMutation.mutate(val);
    }
  };

  const resolvedCex = cexName === "Other" ? customCex : cexName;
  const canSubmit = BASE58_REGEX.test(targetWallet) && BASE58_REGEX.test(kycWallet) && resolvedCex.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            Manual KYC Root Override
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Paste a dev/target wallet and the CEX wallet that funded it. System auto-detects known CEX wallets.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Target Wallet (dev/funder)</Label>
              <Input
                placeholder="Paste the wallet you want to tag with KYC…"
                value={targetWallet}
                onChange={(e) => setTargetWallet(e.target.value.trim())}
                className="font-mono text-xs h-9"
              />
              {targetWallet && !BASE58_REGEX.test(targetWallet) && (
                <p className="text-[10px] text-destructive">Invalid Solana address</p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-medium">KYC / CEX Wallet (the exchange wallet)</Label>
              <div className="relative">
                <Input
                  placeholder="Paste the CEX hot wallet address…"
                  value={kycWallet}
                  onChange={(e) => handleKycWalletChange(e.target.value.trim())}
                  className="font-mono text-xs h-9"
                />
                {lookupMutation.isPending && (
                  <div className="absolute right-2 top-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                )}
              </div>
              {lookupMutation.data?.isKnownCex && (
                <Badge variant="default" className="text-[10px] bg-green-600/80">
                  <Building2 className="h-3 w-3 mr-1" />
                  Auto-detected: {lookupMutation.data.cexName}
                </Badge>
              )}
              {kycWallet && BASE58_REGEX.test(kycWallet) && lookupMutation.data && !lookupMutation.data.isKnownCex && (
                <p className="text-[10px] text-amber-500">Not in known CEX list — select manually below</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium">CEX Name</Label>
              <Select value={cexName} onValueChange={setCexName}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select exchange…" />
                </SelectTrigger>
                <SelectContent>
                  {KNOWN_CEXES.map((c) => (
                    <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {cexName === "Other" && (
              <div className="space-y-2">
                <Label className="text-xs font-medium">Custom CEX Name</Label>
                <Input
                  placeholder="e.g. Backpack"
                  value={customCex}
                  onChange={(e) => setCustomCex(e.target.value)}
                  className="text-xs h-9"
                  maxLength={50}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-medium">Label (optional)</Label>
              <Input
                placeholder="e.g. Binance Hot Wallet 7"
                value={cexLabel}
                onChange={(e) => setCexLabel(e.target.value)}
                className="text-xs h-9"
                maxLength={100}
              />
            </div>
          </div>

          <Button
            onClick={() => addKycMutation.mutate()}
            disabled={!canSubmit || addKycMutation.isPending}
            className="gap-2"
            size="sm"
          >
            <ShieldCheck className="h-4 w-4" />
            {addKycMutation.isPending ? "Writing mesh…" : "Set KYC Root"}
          </Button>
        </CardContent>
      </Card>

      {/* Known CEX Wallets Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4" />
            Known CEX Wallets
            <Badge variant="secondary" className="text-[10px]">
              {cexWallets?.length ?? 0}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-64 overflow-y-auto space-y-1">
            {cexWallets?.map((w: any) => (
              <div key={w.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] px-1.5">{w.cex_name}</Badge>
                  <span className="font-mono text-muted-foreground">
                    {w.wallet_address.slice(0, 8)}…{w.wallet_address.slice(-6)}
                  </span>
                  {w.cex_label && (
                    <span className="text-muted-foreground/70">{w.cex_label}</span>
                  )}
                </div>
                <a
                  href={`https://solscan.io/account/${w.wallet_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
            {(!cexWallets || cexWallets.length === 0) && (
              <p className="text-xs text-muted-foreground py-4 text-center">No known CEX wallets yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
