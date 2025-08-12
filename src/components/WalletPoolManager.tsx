import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useWalletPool } from "@/hooks/useWalletPool";
import { useLocalSecrets } from "@/hooks/useLocalSecrets";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { refundToFunder, splitEvenly } from "@/lib/solana";
import { toast } from "@/hooks/use-toast";

export default function WalletPoolManager() {
  const { state, wallets, setMode, ensureCount, importCustomSecrets, removeAt } = useWalletPool();
  const { secrets } = useLocalSecrets();
  const [conn, setConn] = useState<Connection | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [overrideAddr, setOverrideAddr] = useState<string>("");

  useEffect(() => {
    if (secrets?.rpcUrl) setConn(new Connection(secrets.rpcUrl, { commitment: "confirmed" }));
  }, [secrets?.rpcUrl]);

  const pubkeys = useMemo(() => wallets.map((w) => w.pubkey), [wallets]);

  useEffect(() => {
    let cancelled = false;
    if (!conn || wallets.length === 0) return;
    (async () => {
      const entries: Record<string, number> = {};
      for (const w of wallets) {
        try {
          const lam = await conn.getBalance(new PublicKey(w.pubkey));
          if (!cancelled) entries[w.pubkey] = lam / 1_000_000_000;
        } catch {}
      }
      if (!cancelled) setBalances(entries);
    })();
    return () => { cancelled = true; };
  }, [conn, pubkeys.join(",")]);

  const handleImport = (raw: string) => {
    const list = raw.split(/\n|,|;|\s+/).map((s) => s.trim()).filter(Boolean);
    importCustomSecrets(list);
  };

  const handleRefund = async (idx: number) => {
    if (!conn) return toast({ title: "RPC missing", description: "Set RPC URL in Secrets" });
    try {
      const w = wallets[idx]!;
      const owner = Keypair.fromSecretKey(bs58.decode(w.secretBase58));
      const override = overrideAddr ? new PublicKey(overrideAddr) : null;
      const sig = await refundToFunder({ connection: conn, owner, overrideDestination: override });
      if (sig) toast({ title: "Refund sent", description: sig.slice(0, 12) + "…" });
      else toast({ title: "Nothing to refund", description: "No spendable SOL found" });
    } catch (e:any) {
      toast({ title: "Refund failed", description: e?.message ?? String(e) });
    }
  };

  const handleSplitRemove = async (idx: number) => {
    if (!conn) return toast({ title: "RPC missing", description: "Set RPC URL in Secrets" });
    try {
      const from = wallets[idx]!;
      const others = wallets.filter((_, i) => i !== idx).map((x) => new PublicKey(x.pubkey));
      const owner = Keypair.fromSecretKey(bs58.decode(from.secretBase58));
      const sig = await splitEvenly({ connection: conn, owner, targets: others });
      if (sig) {
        toast({ title: "Split complete", description: sig.slice(0, 12) + "…" });
        removeAt(idx);
      } else {
        toast({ title: "No SOL to split", description: "Balance too low" });
      }
    } catch (e:any) {
      toast({ title: "Split failed", description: e?.message ?? String(e) });
    }
  };

  return (
    <Card className="max-w-4xl mx-auto mb-10">
      <CardHeader>
        <CardTitle>Wallet Pool — Multi‑Wallet Spray</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="space-y-3">
            <Label>Mode</Label>
            <div className="flex gap-3">
              <Button variant={state.mode === "generated" ? "default" : "outline"} onClick={() => setMode("generated")}>Generate</Button>
              <Button variant={state.mode === "custom" ? "default" : "outline"} onClick={() => setMode("custom")}>My wallets</Button>
            </div>
          </div>
          {state.mode === "generated" ? (
            <div className="space-y-3">
              <Label>Wallet count</Label>
              <div className="flex items-center gap-4">
                <Slider min={1} max={10} step={1} value={[wallets.length || 1]} onValueChange={(v) => ensureCount(v[0] ?? 1)} className="max-w-xs" />
                <div className="text-sm text-muted-foreground">{wallets.length} / 10</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Paste private keys (base58 or JSON, separated by spaces/newlines)</Label>
              <Input placeholder="base58 or [1,2,3,...]" onBlur={(e) => handleImport(e.target.value)} />
              <div className="text-xs text-muted-foreground">Up to 10 wallets stored locally in your browser.</div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label>Override refund address (optional)</Label>
          <Input placeholder="Destination public key" value={overrideAddr} onChange={(e) => setOverrideAddr(e.target.value.trim())} />
        </div>

        <div className="space-y-2">
          <Label>Wallets</Label>
          <div className="space-y-2">
            {wallets.map((w, i) => (
              <div key={w.pubkey} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border p-3">
                <div className="text-sm break-all">
                  <div className="font-medium">{w.pubkey}</div>
                  <div className="text-muted-foreground">SOL: {balances[w.pubkey]?.toFixed(4) ?? "…"}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => handleRefund(i)}>Refund to funder</Button>
                  {wallets.length > 1 && (
                    <Button variant="secondary" onClick={() => handleSplitRemove(i)}>Decommission & Split</Button>
                  )}
                </div>
              </div>
            ))}
            {wallets.length === 0 && (
              <div className="text-sm text-muted-foreground">No wallets yet.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
